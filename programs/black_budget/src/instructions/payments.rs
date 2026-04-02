use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::{self, Token2022, TransferChecked};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::state::*;

// ─── EVENTS ─────────────────────────────────────────────────────────

#[event]
pub struct PaymentCreated {
    pub company: Pubkey,
    pub payment_id: u64,
    pub requester: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub category: u8,
    pub status: u8, // 0=Pending, 1=Approved
    pub required_approvals: u8,
    pub timestamp: i64,
}

#[event]
pub struct PaymentApproved {
    pub company: Pubkey,
    pub payment_id: u64,
    pub approver: Pubkey,
    pub approvals_count: u8,
    pub fully_approved: bool,
    pub timestamp: i64,
}

#[event]
pub struct PaymentExecuted {
    pub company: Pubkey,
    pub payment_id: u64,
    pub recipient: Pubkey,
    pub amount: u64,
    pub total_spent: u64,
    pub monthly_spent: u64,
    pub timestamp: i64,
}

#[event]
pub struct PaymentRejected {
    pub company: Pubkey,
    pub payment_id: u64,
    pub rejector: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MonthlySpendReset {
    pub company: Pubkey,
    pub previous_month: u8,
    pub new_month: u8,
    pub previous_monthly_spent: u64,
    pub timestamp: i64,
}

// ─── HELPER: Lazy monthly reset ─────────────────────────────────────

fn maybe_reset_monthly_spend(company: &mut Account<Company>, clock: &Clock) {
    // Extract month (1-12) from unix timestamp
    // Simple approach: days since epoch / 30 gives approximate month counter
    // More precise: use actual calendar month
    let days_since_epoch = (clock.unix_timestamp / 86400) as u64;
    let current_month = ((days_since_epoch / 30) % 256) as u8; // wrapping month counter

    if company.current_month != current_month && company.current_month != 0 {
        emit!(MonthlySpendReset {
            company: company.key(),
            previous_month: company.current_month,
            new_month: current_month,
            previous_monthly_spent: company.monthly_spent,
            timestamp: clock.unix_timestamp,
        });
        company.monthly_spent = 0;
    }
    company.current_month = current_month;
}

// ─── CREATE PAYMENT REQUEST ─────────────────────────────────────────

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct CreatePayment<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,

    #[account(
        mut,
        seeds = [b"company", company.authority.as_ref()],
        bump = company.bump,
    )]
    pub company: Account<'info, Company>,

    #[account(
        seeds = [b"member", company.key().as_ref(), requester.key().as_ref()],
        bump = requester_member.bump,
        constraint = requester_member.is_active @ PaymentError::MemberInactive,
        constraint = requester_member.role.can_create_payment() @ PaymentError::CannotCreatePayment,
    )]
    pub requester_member: Account<'info, Member>,

    /// CHECK: Recipient wallet — validated off-chain
    pub recipient: UncheckedAccount<'info>,

    #[account(
        init,
        payer = requester,
        space = 8 + PaymentRequest::INIT_SPACE,
        seeds = [
            b"payment",
            company.key().as_ref(),
            &company.payment_nonce.to_le_bytes(),
        ],
        bump,
    )]
    pub payment: Account<'info, PaymentRequest>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_payment(
    ctx: Context<CreatePayment>,
    amount: u64,
    category: PaymentCategory,
    description_hash: [u8; 32],
    memo: String,
    risk_score: u8,
) -> Result<()> {
    require!(amount > 0, PaymentError::ZeroAmount);
    require!(memo.len() <= MAX_MEMO_LEN, PaymentError::MemoTooLong);

    let clock = Clock::get()?;
    let company = &mut ctx.accounts.company;

    // Lazy monthly reset
    maybe_reset_monthly_spend(company, &clock);

    let policy = &company.policy;

    // Check monthly burn cap
    if policy.monthly_burn_cap > 0 {
        require!(
            company.monthly_spent + amount <= policy.monthly_burn_cap,
            PaymentError::MonthlyCapExceeded
        );
    }

    // Determine required approvals
    let required_approvals = if amount <= policy.auto_approve_limit {
        0
    } else if policy.dual_approve_threshold > 0 && amount > policy.dual_approve_threshold {
        2
    } else {
        1
    };

    let status = if required_approvals == 0 {
        PaymentStatus::Approved
    } else {
        PaymentStatus::Pending
    };

    let payment = &mut ctx.accounts.payment;
    payment.company = company.key();
    payment.requester = ctx.accounts.requester.key();
    payment.recipient = ctx.accounts.recipient.key();
    payment.amount = amount;
    payment.category = category;
    payment.description_hash = description_hash;
    payment.memo = memo;
    payment.status = status;
    payment.approvals = Vec::new();
    payment.required_approvals = required_approvals;
    payment.payment_id = company.payment_nonce;
    payment.risk_score = risk_score;
    payment.created_at = clock.unix_timestamp;
    payment.executed_at = 0;
    payment.bump = ctx.bumps.payment;

    company.payment_nonce += 1;

    emit!(PaymentCreated {
        company: company.key(),
        payment_id: payment.payment_id,
        requester: payment.requester,
        recipient: payment.recipient,
        amount,
        category: category as u8,
        status: if required_approvals == 0 { 1 } else { 0 },
        required_approvals,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Payment #{} created: {} USDC — {:?} (need {} approvals)",
        payment.payment_id, amount / 1_000_000, status, required_approvals
    );

    Ok(())
}

// ─── APPROVE PAYMENT ────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ApprovePayment<'info> {
    pub approver: Signer<'info>,

    #[account(
        seeds = [b"company", company.authority.as_ref()],
        bump = company.bump,
    )]
    pub company: Account<'info, Company>,

    #[account(
        seeds = [b"member", company.key().as_ref(), approver.key().as_ref()],
        bump = approver_member.bump,
        constraint = approver_member.is_active @ PaymentError::MemberInactive,
        constraint = approver_member.role.can_approve() @ PaymentError::CannotApprove,
    )]
    pub approver_member: Account<'info, Member>,

    #[account(
        mut,
        seeds = [
            b"payment",
            company.key().as_ref(),
            &payment.payment_id.to_le_bytes(),
        ],
        bump = payment.bump,
        constraint = payment.status == PaymentStatus::Pending @ PaymentError::NotPending,
        constraint = payment.company == company.key() @ PaymentError::WrongCompany,
    )]
    pub payment: Account<'info, PaymentRequest>,
}

pub fn handle_approve_payment(ctx: Context<ApprovePayment>) -> Result<()> {
    let clock = Clock::get()?;
    let payment = &mut ctx.accounts.payment;
    let approver_key = ctx.accounts.approver.key();

    require!(
        approver_key != payment.requester,
        PaymentError::CannotApproveSelf
    );

    require!(
        !payment.approvals.contains(&approver_key),
        PaymentError::AlreadyApproved
    );

    payment.approvals.push(approver_key);
    let fully_approved = payment.approvals.len() >= payment.required_approvals as usize;

    if fully_approved {
        payment.status = PaymentStatus::Approved;
    }

    emit!(PaymentApproved {
        company: ctx.accounts.company.key(),
        payment_id: payment.payment_id,
        approver: approver_key,
        approvals_count: payment.approvals.len() as u8,
        fully_approved,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── REJECT PAYMENT ─────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RejectPayment<'info> {
    pub rejector: Signer<'info>,

    #[account(
        seeds = [b"company", company.authority.as_ref()],
        bump = company.bump,
    )]
    pub company: Account<'info, Company>,

    #[account(
        seeds = [b"member", company.key().as_ref(), rejector.key().as_ref()],
        bump = rejector_member.bump,
        constraint = rejector_member.is_active @ PaymentError::MemberInactive,
        constraint = rejector_member.role.can_approve() @ PaymentError::CannotApprove,
    )]
    pub rejector_member: Account<'info, Member>,

    #[account(
        mut,
        seeds = [
            b"payment",
            company.key().as_ref(),
            &payment.payment_id.to_le_bytes(),
        ],
        bump = payment.bump,
        constraint = payment.status == PaymentStatus::Pending @ PaymentError::NotPending,
    )]
    pub payment: Account<'info, PaymentRequest>,
}

pub fn handle_reject_payment(ctx: Context<RejectPayment>) -> Result<()> {
    let clock = Clock::get()?;
    let payment = &mut ctx.accounts.payment;
    payment.status = PaymentStatus::Rejected;

    emit!(PaymentRejected {
        company: ctx.accounts.company.key(),
        payment_id: payment.payment_id,
        rejector: ctx.accounts.rejector.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─── EXECUTE PAYMENT (with auto-create recipient ATA) ───────────────

#[derive(Accounts)]
pub struct ExecutePayment<'info> {
    #[account(mut)]
    pub executor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"company", company.authority.as_ref()],
        bump = company.bump,
    )]
    pub company: Account<'info, Company>,

    #[account(
        seeds = [b"member", company.key().as_ref(), executor.key().as_ref()],
        bump = executor_member.bump,
        constraint = executor_member.is_active @ PaymentError::MemberInactive,
        constraint = executor_member.role.can_approve() @ PaymentError::CannotApprove,
    )]
    pub executor_member: Account<'info, Member>,

    #[account(
        mut,
        seeds = [
            b"payment",
            company.key().as_ref(),
            &payment.payment_id.to_le_bytes(),
        ],
        bump = payment.bump,
        constraint = payment.status == PaymentStatus::Approved @ PaymentError::NotApproved,
    )]
    pub payment: Account<'info, PaymentRequest>,

    /// Company's USDC vault
    #[account(
        mut,
        seeds = [b"vault", company.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = company,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Recipient's USDC token account — init_if_needed creates ATA automatically
    #[account(
        init_if_needed,
        payer = executor,
        associated_token::mint = usdc_mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_program,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: The payment's recipient (owner of the token account)
    #[account(constraint = recipient.key() == payment.recipient @ PaymentError::WrongRecipient)]
    pub recipient: UncheckedAccount<'info>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_execute_payment(ctx: Context<ExecutePayment>) -> Result<()> {
    let clock = Clock::get()?;
    let payment = &mut ctx.accounts.payment;
    let company = &mut ctx.accounts.company;

    // Lazy monthly reset
    maybe_reset_monthly_spend(company, &clock);

    require!(
        ctx.accounts.vault.amount >= payment.amount,
        PaymentError::InsufficientVaultBalance
    );

    // Transfer USDC from vault to recipient
    let authority_key = company.authority;
    let company_bump = company.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"company",
        authority_key.as_ref(),
        &[company_bump],
    ]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.usdc_mint.to_account_info(),
        to: ctx.accounts.recipient_token_account.to_account_info(),
        authority: company.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token_2022::transfer_checked(cpi_ctx, payment.amount, 6)?;

    // Update state
    payment.status = PaymentStatus::Executed;
    payment.executed_at = clock.unix_timestamp;
    company.total_spent += payment.amount;
    company.monthly_spent += payment.amount;

    emit!(PaymentExecuted {
        company: company.key(),
        payment_id: payment.payment_id,
        recipient: payment.recipient,
        amount: payment.amount,
        total_spent: company.total_spent,
        monthly_spent: company.monthly_spent,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Payment #{} EXECUTED: {} USDC to {}",
        payment.payment_id, payment.amount / 1_000_000, payment.recipient
    );

    Ok(())
}

#[error_code]
pub enum PaymentError {
    #[msg("Payment amount must be greater than zero")]
    ZeroAmount,
    #[msg("Memo too long")]
    MemoTooLong,
    #[msg("Monthly burn cap exceeded")]
    MonthlyCapExceeded,
    #[msg("Member is not active")]
    MemberInactive,
    #[msg("Member cannot create payments")]
    CannotCreatePayment,
    #[msg("Member cannot approve payments")]
    CannotApprove,
    #[msg("Payment is not in pending status")]
    NotPending,
    #[msg("Payment is not approved yet")]
    NotApproved,
    #[msg("Payment does not belong to this company")]
    WrongCompany,
    #[msg("Already approved by this member")]
    AlreadyApproved,
    #[msg("Runway too low — discretionary spend blocked")]
    RunwayTooLow,
    #[msg("Recipient does not match payment")]
    WrongRecipient,
    #[msg("Cannot approve your own payment")]
    CannotApproveSelf,
    #[msg("Vault has insufficient balance")]
    InsufficientVaultBalance,
}
