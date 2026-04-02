use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(proof_type: ProofType, merkle_root: [u8; 32], payment_count: u32, period_start: i64, period_end: i64)]
pub struct RecordProof<'info> {
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
        constraint = member.is_active @ ProofError::MemberInactive,
        constraint = member.role.can_export_proofs() @ ProofError::CannotExportProofs,
    )]
    pub member: Account<'info, Member>,

    #[account(
        init,
        payer = authority,
        space = 8 + ProofRecord::INIT_SPACE,
        seeds = [
            b"proof",
            company.key().as_ref(),
            &[proof_type as u8],
            &period_end.to_le_bytes(),
        ],
        bump,
    )]
    pub proof_record: Account<'info, ProofRecord>,

    pub clock: Sysvar<'info, Clock>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct ProofAnchored {
    pub company: Pubkey,
    pub proof_type: u8,
    pub merkle_root: [u8; 32],
    pub payment_count: u32,
    pub period_start: i64,
    pub period_end: i64,
    pub generated_by: Pubkey,
    pub timestamp: i64,
}

pub fn handle_record_proof(
    ctx: Context<RecordProof>,
    proof_type: ProofType,
    merkle_root: [u8; 32],
    payment_count: u32,
    period_start: i64,
    period_end: i64,
) -> Result<()> {
    require!(period_start < period_end, ProofError::InvalidPeriod);

    let clock = Clock::get()?;

    let record = &mut ctx.accounts.proof_record;
    record.company = ctx.accounts.company.key();
    record.generated_by = ctx.accounts.authority.key();
    record.proof_type = proof_type;
    record.merkle_root = merkle_root;
    record.period_start = period_start;
    record.period_end = period_end;
    record.payment_count = payment_count;
    record.generated_at = clock.unix_timestamp;
    record.bump = ctx.bumps.proof_record;

    emit!(ProofAnchored {
        company: record.company,
        proof_type: proof_type as u8,
        merkle_root,
        payment_count,
        period_start,
        period_end,
        generated_by: record.generated_by,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Proof anchored: {} payments, root starts with [{},{},{},{}]",
        payment_count,
        merkle_root[0], merkle_root[1], merkle_root[2], merkle_root[3]
    );

    Ok(())
}

#[error_code]
pub enum ProofError {
    #[msg("Member is not active")]
    MemberInactive,
    #[msg("Member cannot export proofs")]
    CannotExportProofs,
    #[msg("Period start must be before period end")]
    InvalidPeriod,
}
