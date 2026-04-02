use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::state::*;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitCompany<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Company::INIT_SPACE,
        seeds = [b"company", authority.key().as_ref()],
        bump,
    )]
    pub company: Account<'info, Company>,

    /// The company's USDC vault (Token-2022)
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = company,
        token::token_program = token_program,
        seeds = [b"vault", company.key().as_ref()],
        bump,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// USDC mint (Token-2022)
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    /// The founder is auto-added as Owner member
    #[account(
        init,
        payer = authority,
        space = 8 + Member::INIT_SPACE,
        seeds = [b"member", company.key().as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub founder_member: Account<'info, Member>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_company(ctx: Context<InitCompany>, name: String) -> Result<()> {
    require!(name.len() <= MAX_NAME_LEN, ErrorCode::NameTooLong);

    let clock = Clock::get()?;

    // Initialize company
    let company = &mut ctx.accounts.company;
    company.authority = ctx.accounts.authority.key();
    company.name = name;
    company.vault = ctx.accounts.vault.key();
    company.policy = PolicyConfig::default();
    company.member_count = 1;
    company.payment_nonce = 0;
    company.total_spent = 0;
    company.monthly_spent = 0;
    company.current_month = 0;
    company.created_at = clock.unix_timestamp;
    company.bump = ctx.bumps.company;

    // Auto-add founder as Owner
    let member = &mut ctx.accounts.founder_member;
    member.company = company.key();
    member.wallet = ctx.accounts.authority.key();
    member.role = Role::Owner;
    member.label = "Founder".to_string();
    member.added_at = clock.unix_timestamp;
    member.is_active = true;
    member.bump = ctx.bumps.founder_member;

    msg!("Company '{}' initialized with vault {}", company.name, company.vault);
    Ok(())
}

#[error_code]
pub enum ErrorCode {
    #[msg("Company name exceeds maximum length")]
    NameTooLong,
}
