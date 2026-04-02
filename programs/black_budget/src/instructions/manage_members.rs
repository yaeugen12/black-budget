use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct AddMember<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"company", authority.key().as_ref()],
        bump = company.bump,
        has_one = authority,
    )]
    pub company: Account<'info, Company>,

    /// Verify the caller is an Owner
    #[account(
        seeds = [b"member", company.key().as_ref(), authority.key().as_ref()],
        bump = authority_member.bump,
        constraint = authority_member.role == Role::Owner @ MemberError::NotOwner,
        constraint = authority_member.is_active @ MemberError::MemberInactive,
    )]
    pub authority_member: Account<'info, Member>,

    /// The new member being added
    /// CHECK: This is the wallet address of the new member
    pub new_member_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Member::INIT_SPACE,
        seeds = [b"member", company.key().as_ref(), new_member_wallet.key().as_ref()],
        bump,
    )]
    pub member: Account<'info, Member>,

    pub system_program: Program<'info, System>,
}

pub fn handle_add_member(
    ctx: Context<AddMember>,
    role: Role,
    label: String,
) -> Result<()> {
    require!(label.len() <= MAX_LABEL_LEN, MemberError::LabelTooLong);
    require!(
        ctx.accounts.company.member_count < MAX_MEMBERS as u8,
        MemberError::MaxMembersReached
    );

    let clock = Clock::get()?;

    let member = &mut ctx.accounts.member;
    member.company = ctx.accounts.company.key();
    member.wallet = ctx.accounts.new_member_wallet.key();
    member.role = role;
    member.label = label;
    member.added_at = clock.unix_timestamp;
    member.is_active = true;
    member.bump = ctx.bumps.member;

    ctx.accounts.company.member_count += 1;

    msg!(
        "Member {} added as {:?}",
        member.wallet,
        member.role
    );
    Ok(())
}

#[derive(Accounts)]
pub struct RemoveMember<'info> {
    #[account(mut)]
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
        constraint = authority_member.role == Role::Owner @ MemberError::NotOwner,
        constraint = authority_member.is_active @ MemberError::MemberInactive,
    )]
    pub authority_member: Account<'info, Member>,

    #[account(
        mut,
        seeds = [b"member", company.key().as_ref(), target_member.wallet.as_ref()],
        bump = target_member.bump,
        constraint = target_member.company == company.key() @ MemberError::WrongCompany,
        constraint = target_member.wallet != authority.key() @ MemberError::CannotRemoveSelf,
    )]
    pub target_member: Account<'info, Member>,
}

pub fn handle_remove_member(ctx: Context<RemoveMember>) -> Result<()> {
    let member = &mut ctx.accounts.target_member;
    member.is_active = false;
    ctx.accounts.company.member_count -= 1;

    msg!("Member {} deactivated", member.wallet);
    Ok(())
}

#[error_code]
pub enum MemberError {
    #[msg("Only the Owner can manage members")]
    NotOwner,
    #[msg("Member label too long")]
    LabelTooLong,
    #[msg("Maximum members reached")]
    MaxMembersReached,
    #[msg("Member is not active")]
    MemberInactive,
    #[msg("Member does not belong to this company")]
    WrongCompany,
    #[msg("Cannot remove yourself")]
    CannotRemoveSelf,
}
