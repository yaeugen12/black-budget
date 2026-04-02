use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, TransferChecked};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::state::*;

// ─── CREATE PAYMENT REQUEST ─────────────────────────────────────────

#[derive(Accounts)]
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

    /// CHECK: Recipient wallet — validated off-chain (vendor address)
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
    let policy = &company.policy;

    // Check monthly burn cap
    if policy.monthly_burn_cap > 0 {
        require!(
            company.monthly_spent + amount <= policy.monthly_burn_cap,
            PaymentError::MonthlyCapExceeded
        );
    }

    // Check runway protection
    // (simplified: in production, read vault balance)

    // Determine required approvals based on policy
    let required_approvals = if amount <= policy.auto_approve_limit {
        0 // Auto-approve
    } else if policy.dual_approve_threshold > 0 && amount > policy.dual_approve_threshold {
        2 // Dual approval required
    } else {
        1 // Single approval
    };

    // Determine initial status
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

    msg!(
        "Payment #{} created: {} USDC to {} — status: {:?} (need {} approvals)",
        payment.payment_id,
        amount / 1_000_000,
        payment.recipient,
        status,
        required_approvals
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
    let payment = &mut ctx.accounts.payment;
    let approver_key = ctx.accounts.approver.key();

    // Check not already approved by this person
    require!(
        !payment.approvals.contains(&approver_key),
        PaymentError::AlreadyApproved
    );

    payment.approvals.push(approver_key);

    // Check if enough approvals
    if payment.approvals.len() >= payment.required_approvals as usize {
        payment.status = PaymentStatus::Approved;
        msg!("Payment #{} APPROVED (all approvals received)", payment.payment_id);
    } else {
        msg!(
            "Payment #{} approved by {} ({}/{})",
            payment.payment_id,
            approver_key,
            payment.approvals.len(),
            payment.required_approvals
        );
    }

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
    let payment = &mut ctx.accounts.payment;
    payment.status = PaymentStatus::Rejected;
    msg!("Payment #{} REJECTED by {}", payment.payment_id, ctx.accounts.rejector.key());
    Ok(())
}

// ─── EXECUTE PAYMENT (Transfer funds) ────────────────────────────────

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

    /// Recipient's USDC token account
    #[account(
        mut,
        token::mint = usdc_mint,
        token::token_program = token_program,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Program<'info, Token2022>,
}

pub fn handle_execute_payment(ctx: Context<ExecutePayment>) -> Result<()> {
    let clock = Clock::get()?;
    let payment = &mut ctx.accounts.payment;
    let company = &mut ctx.accounts.company;

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
    // USDC has 6 decimals
    token_2022::transfer_checked(cpi_ctx, payment.amount, 6)?;

    // Update payment status
    payment.status = PaymentStatus::Executed;
    payment.executed_at = clock.unix_timestamp;

    // Update company spend tracking
    company.total_spent += payment.amount;
    company.monthly_spent += payment.amount;

    msg!(
        "Payment #{} EXECUTED: {} USDC transferred to {}",
        payment.payment_id,
        payment.amount / 1_000_000,
        payment.recipient
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
}
