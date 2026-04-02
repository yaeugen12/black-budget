use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(constraint_hash: [u8; 32], merkle_root: [u8; 32], result: bool, payment_count: u32, period_start: i64, period_end: i64)]
pub struct RecordComplianceProof<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"company", company.authority.as_ref()],
        bump = company.bump,
    )]
    pub company: Account<'info, Company>,

    #[account(
        seeds = [b"member", company.key().as_ref(), authority.key().as_ref()],
        bump = member.bump,
        constraint = member.is_active @ ComplianceProofError::MemberInactive,
        constraint = member.role.can_export_proofs() @ ComplianceProofError::CannotExportProofs,
    )]
    pub member: Account<'info, Member>,

    #[account(
        init,
        payer = authority,
        space = 8 + ComplianceProof::INIT_SPACE,
        seeds = [
            b"compliance",
            company.key().as_ref(),
            constraint_hash.as_ref(),
            &period_end.to_le_bytes(),
        ],
        bump,
    )]
    pub compliance_proof: Account<'info, ComplianceProof>,

    pub clock: Sysvar<'info, Clock>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct ComplianceProofAnchored {
    pub company: Pubkey,
    pub constraint_hash: [u8; 32],
    pub merkle_root: [u8; 32],
    pub result: bool,
    pub payment_count: u32,
    pub period_start: i64,
    pub period_end: i64,
    pub generated_by: Pubkey,
    pub timestamp: i64,
}

pub fn handle_record_compliance_proof(
    ctx: Context<RecordComplianceProof>,
    constraint_hash: [u8; 32],
    merkle_root: [u8; 32],
    result: bool,
    payment_count: u32,
    period_start: i64,
    period_end: i64,
) -> Result<()> {
    require!(period_start < period_end, ComplianceProofError::InvalidPeriod);

    let clock = Clock::get()?;

    let proof = &mut ctx.accounts.compliance_proof;
    proof.company = ctx.accounts.company.key();
    proof.generated_by = ctx.accounts.authority.key();
    proof.constraint_hash = constraint_hash;
    proof.merkle_root = merkle_root;
    proof.result = result;
    proof.payment_count = payment_count;
    proof.period_start = period_start;
    proof.period_end = period_end;
    proof.generated_at = clock.unix_timestamp;
    proof.bump = ctx.bumps.compliance_proof;

    emit!(ComplianceProofAnchored {
        company: proof.company,
        constraint_hash,
        merkle_root,
        result,
        payment_count,
        period_start,
        period_end,
        generated_by: proof.generated_by,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Compliance proof anchored: result={}, hash starts with [{},{},{},{}]",
        result,
        constraint_hash[0], constraint_hash[1], constraint_hash[2], constraint_hash[3]
    );

    Ok(())
}

#[error_code]
pub enum ComplianceProofError {
    #[msg("Member is not active")]
    MemberInactive,
    #[msg("Member cannot export proofs")]
    CannotExportProofs,
    #[msg("Period start must be before period end")]
    InvalidPeriod,
}
