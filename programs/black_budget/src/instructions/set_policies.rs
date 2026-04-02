use anchor_lang::prelude::*;

use crate::state::*;

#[event]
pub struct PoliciesUpdated {
    pub company: Pubkey,
    pub authority: Pubkey,
    pub auto_approve_limit: u64,
    pub dual_approve_threshold: u64,
    pub monthly_burn_cap: u64,
}

#[derive(Accounts)]
pub struct SetPolicies<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"company", authority.key().as_ref()],
        bump = company.bump,
        has_one = authority,
    )]
    pub company: Account<'info, Company>,

    #[account(
        seeds = [b"member", company.key().as_ref(), authority.key().as_ref()],
        bump = authority_member.bump,
        constraint = authority_member.role == Role::Owner @ PolicyError::NotOwner,
        constraint = authority_member.is_active @ PolicyError::MemberInactive,
    )]
    pub authority_member: Account<'info, Member>,
}

pub fn handle_set_policies(ctx: Context<SetPolicies>, policy: PolicyConfig) -> Result<()> {
    // Validate policy sanity
    if policy.dual_approve_threshold > 0 {
        require!(
            policy.dual_approve_threshold > policy.auto_approve_limit,
            PolicyError::InvalidThresholds
        );
    }

    let company = &mut ctx.accounts.company;
    company.policy = policy;

    emit!(PoliciesUpdated {
        company: company.key(),
        authority: ctx.accounts.authority.key(),
        auto_approve_limit: company.policy.auto_approve_limit,
        dual_approve_threshold: company.policy.dual_approve_threshold,
        monthly_burn_cap: company.policy.monthly_burn_cap,
    });

    msg!("Policies updated for company '{}'", company.name);
    msg!(
        "  Auto-approve: {} USDC | Dual-approve: {} USDC | Monthly cap: {} USDC",
        company.policy.auto_approve_limit / 1_000_000,
        company.policy.dual_approve_threshold / 1_000_000,
        company.policy.monthly_burn_cap / 1_000_000,
    );
    Ok(())
}

#[error_code]
pub enum PolicyError {
    #[msg("Only the Owner can set policies")]
    NotOwner,
    #[msg("Member is not active")]
    MemberInactive,
    #[msg("Dual-approve threshold must be greater than auto-approve limit")]
    InvalidThresholds,
}
