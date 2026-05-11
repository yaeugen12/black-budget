//! confidential-policy — Companion Anchor program to Black Budget.
//!
//! Phase A of the Arcium integration (see repo root `ARCIUM_INTEGRATION.md` §4).
//! This program is invoked by Black Budget's frontend (and/or Black Budget's
//! main program via CPI in a later phase) to:
//!
//! 1. Initialise MXE-owned encrypted policy storage for a company.
//! 2. Evaluate a payment request against the policy inside an Arcium MXE,
//!    returning the encrypted decision (`required_approvals`).
//! 3. Commit an executed payment's spend into the encrypted monthly accumulator.
//! 4. Reset the monthly accumulator at calendar month rollover.
//! 5. Update mutable policy limits (auto-approve, dual-approve, burn cap).
//!
//! The four Arcis circuits backing these flows live in `../../encrypted-ixs/src/lib.rs`.
//! Each is wired up here with: a `init_*_comp_def` instruction, a `queue_computation`
//! entry, and an `#[arcium_callback]` handler that persists the encrypted output to
//! a company-scoped PDA.

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

// ── Computation definition offsets (must match circuit fn names) ────────────

const COMP_DEF_OFFSET_INIT_POLICY: u32 = comp_def_offset("init_company_policy");
const COMP_DEF_OFFSET_EVAL_POLICY: u32 = comp_def_offset("evaluate_policy");
const COMP_DEF_OFFSET_COMMIT_SPEND: u32 = comp_def_offset("commit_executed_payment");
const COMP_DEF_OFFSET_RESET_MONTH: u32 = comp_def_offset("reset_monthly_spend");
const COMP_DEF_OFFSET_UPDATE_LIMITS: u32 = comp_def_offset("update_policy_limits");

declare_id!("ConfidentialPolicy1111111111111111111111111");

#[arcium_program]
pub mod confidential_policy {
    use super::*;

    // ─── COMP DEF INITIALISERS (one-time, run by deployer) ────────────────

    pub fn init_init_policy_comp_def(ctx: Context<InitInitPolicyCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_eval_policy_comp_def(ctx: Context<InitEvalPolicyCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_commit_spend_comp_def(ctx: Context<InitCommitSpendCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_reset_month_comp_def(ctx: Context<InitResetMonthCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_update_limits_comp_def(ctx: Context<InitUpdateLimitsCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    // ─── 1. INIT COMPANY POLICY ────────────────────────────────────────────

    /// Initialise MXE-owned encrypted policy for a company.
    ///
    /// Caller provides ciphertexts of (auto_approve_limit, dual_approve_threshold,
    /// monthly_burn_cap, monthly_spent=0) encrypted under the shared (client+MXE) key.
    /// The MXE re-keys to its own internal storage; subsequent reads/writes don't
    /// require the client key.
    pub fn init_company_policy(
        ctx: Context<InitCompanyPolicy>,
        computation_offset: u64,
        company_id: [u8; 32],

        // PaymentRequest encrypted under shared key:
        encryption_pubkey: [u8; 32],
        encryption_nonce: u128,
        encrypted_auto_approve_limit: [u8; 32],
        encrypted_dual_approve_threshold: [u8; 32],
        encrypted_monthly_burn_cap: [u8; 32],
        encrypted_monthly_spent: [u8; 32], // typically encryption of 0
    ) -> Result<()> {
        ctx.accounts.policy_acc.bump = ctx.bumps.policy_acc;
        ctx.accounts.policy_acc.company_id = company_id;
        ctx.accounts.policy_acc.authority = ctx.accounts.payer.key();
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = ArgBuilder::new()
            .x25519_pubkey(encryption_pubkey)
            .plaintext_u128(encryption_nonce)
            .encrypted_u64(encrypted_auto_approve_limit)
            .encrypted_u64(encrypted_dual_approve_threshold)
            .encrypted_u64(encrypted_monthly_burn_cap)
            .encrypted_u64(encrypted_monthly_spent)
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![InitCompanyPolicyCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey: ctx.accounts.policy_acc.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "init_company_policy")]
    pub fn init_company_policy_callback(
        ctx: Context<InitCompanyPolicyCallback>,
        output: SignedComputationOutputs<InitCompanyPolicyOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(InitCompanyPolicyOutput { field_0 }) => field_0,
            Err(_) => return Err(PolicyError::AbortedComputation.into()),
        };

        // Persist MXE-owned ciphertexts on the policy PDA.
        // CompanyPolicy has 4 u64 fields → 4 ciphertexts of 32 bytes each.
        ctx.accounts.policy_acc.encrypted_policy = o.ciphertexts;
        ctx.accounts.policy_acc.nonce = o.nonce;

        emit!(PolicyInitialized {
            company_id: ctx.accounts.policy_acc.company_id,
            authority: ctx.accounts.policy_acc.authority,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ─── 2. EVALUATE POLICY ────────────────────────────────────────────────

    /// Evaluate an encrypted payment request against the company's encrypted
    /// policy. The returned `PolicyDecision { required_approvals, projected_monthly_spent }`
    /// is encrypted under the requester's shared key and persisted on a per-payment
    /// PDA so the frontend can decrypt and render the approval flow.
    pub fn evaluate_policy(
        ctx: Context<EvaluatePolicy>,
        computation_offset: u64,
        payment_id: u64,

        requester_encryption_pubkey: [u8; 32],
        requester_nonce: u128,

        // PaymentRequest ciphertexts:
        encrypted_amount: [u8; 32],
        encrypted_category: [u8; 32], // u8 padded
        encrypted_risk_score: [u8; 32], // u8 padded
    ) -> Result<()> {
        // Initialise per-payment decision PDA.
        ctx.accounts.decision_acc.bump = ctx.bumps.decision_acc;
        ctx.accounts.decision_acc.company_id = ctx.accounts.policy_acc.company_id;
        ctx.accounts.decision_acc.payment_id = payment_id;
        ctx.accounts.decision_acc.requester = ctx.accounts.payer.key();
        ctx.accounts.decision_acc.status = DecisionStatus::Pending;
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // Pull the encrypted policy out of the policy PDA via the `.account(...)`
        // arg builder — the MXE reads bytes at the given offset directly.
        // policy_acc layout: 8 disc + 1 bump + 32 company_id + 32 authority
        //                  + (4 * 32) encrypted_policy + 16 nonce + ...
        //                  = 8 + 1 + 32 + 32 = 73 bytes header before encrypted_policy
        const POLICY_CTXT_OFFSET: u32 = 8 + 1 + 32 + 32;
        const POLICY_CTXT_LEN: u32 = 32 * 4; // 4 u64 fields

        let args = ArgBuilder::new()
            // request_ctxt (Shared encryption)
            .x25519_pubkey(requester_encryption_pubkey)
            .plaintext_u128(requester_nonce)
            .encrypted_u64(encrypted_amount)
            .encrypted_u8(encrypted_category)
            .encrypted_u8(encrypted_risk_score)
            // policy_ctxt (Mxe encryption, read from PDA)
            .plaintext_u128(ctx.accounts.policy_acc.nonce)
            .account(
                ctx.accounts.policy_acc.key(),
                POLICY_CTXT_OFFSET,
                POLICY_CTXT_LEN,
            )
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![EvaluatePolicyCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[
                    CallbackAccount {
                        pubkey: ctx.accounts.decision_acc.key(),
                        is_writable: true,
                    },
                    CallbackAccount {
                        pubkey: ctx.accounts.policy_acc.key(),
                        is_writable: true,
                    },
                ],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "evaluate_policy")]
    pub fn evaluate_policy_callback(
        ctx: Context<EvaluatePolicyCallback>,
        output: SignedComputationOutputs<EvaluatePolicyOutput>,
    ) -> Result<()> {
        let (decision_ctxt, policy_ctxt) = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(EvaluatePolicyOutput { field_0, field_1 }) => (field_0, field_1),
            Err(_) => return Err(PolicyError::AbortedComputation.into()),
        };

        // Persist decision ciphertext on the per-payment PDA.
        ctx.accounts.decision_acc.encrypted_decision = decision_ctxt.ciphertexts;
        ctx.accounts.decision_acc.decision_nonce = decision_ctxt.nonce;
        ctx.accounts.decision_acc.status = DecisionStatus::Evaluated;

        // Policy is rewritten unchanged at this stage (see circuit doc — monthly
        // accumulator only advances on commit_executed_payment). Update only the
        // ciphertext payload in case re-keying happened.
        ctx.accounts.policy_acc.encrypted_policy = policy_ctxt.ciphertexts;
        ctx.accounts.policy_acc.nonce = policy_ctxt.nonce;

        emit!(PolicyEvaluated {
            company_id: ctx.accounts.decision_acc.company_id,
            payment_id: ctx.accounts.decision_acc.payment_id,
            requester: ctx.accounts.decision_acc.requester,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ─── 3. COMMIT EXECUTED PAYMENT (advance monthly_spent) ───────────────

    /// Called after Black Budget's main `execute_payment` succeeds. The caller
    /// supplies the same encrypted `projected_monthly_spent` value that came out
    /// of `evaluate_policy` — the MXE applies it idempotently.
    pub fn commit_executed_payment(
        ctx: Context<CommitExecutedPayment>,
        computation_offset: u64,

        requester_encryption_pubkey: [u8; 32],
        requester_nonce: u128,
        encrypted_projected_spend: [u8; 32],
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        // Same offset/len as evaluate_policy.
        const POLICY_CTXT_OFFSET: u32 = 8 + 1 + 32 + 32;
        const POLICY_CTXT_LEN: u32 = 32 * 4;

        let args = ArgBuilder::new()
            .x25519_pubkey(requester_encryption_pubkey)
            .plaintext_u128(requester_nonce)
            .encrypted_u64(encrypted_projected_spend)
            .plaintext_u128(ctx.accounts.policy_acc.nonce)
            .account(
                ctx.accounts.policy_acc.key(),
                POLICY_CTXT_OFFSET,
                POLICY_CTXT_LEN,
            )
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![CommitExecutedPaymentCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey: ctx.accounts.policy_acc.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "commit_executed_payment")]
    pub fn commit_executed_payment_callback(
        ctx: Context<CommitExecutedPaymentCallback>,
        output: SignedComputationOutputs<CommitExecutedPaymentOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(CommitExecutedPaymentOutput { field_0 }) => field_0,
            Err(_) => return Err(PolicyError::AbortedComputation.into()),
        };

        ctx.accounts.policy_acc.encrypted_policy = o.ciphertexts;
        ctx.accounts.policy_acc.nonce = o.nonce;

        emit!(SpendCommitted {
            company_id: ctx.accounts.policy_acc.company_id,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ─── 4. RESET MONTHLY SPEND ────────────────────────────────────────────

    /// Reset monthly_spent to zero. Called by the company Owner once per calendar
    /// month rollover. The Anchor program checks the boundary in plaintext (just
    /// "is the current month different from the stored last_reset_month?") — the
    /// actual reset happens inside the MXE.
    pub fn reset_monthly_spend(
        ctx: Context<ResetMonthlySpend>,
        computation_offset: u64,
        current_month: u8,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.payer.key(),
            ctx.accounts.policy_acc.authority,
            PolicyError::InvalidAuthority
        );
        require!(
            ctx.accounts.policy_acc.last_reset_month != current_month,
            PolicyError::AlreadyResetThisMonth
        );

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        const POLICY_CTXT_OFFSET: u32 = 8 + 1 + 32 + 32;
        const POLICY_CTXT_LEN: u32 = 32 * 4;

        let args = ArgBuilder::new()
            .plaintext_u128(ctx.accounts.policy_acc.nonce)
            .account(
                ctx.accounts.policy_acc.key(),
                POLICY_CTXT_OFFSET,
                POLICY_CTXT_LEN,
            )
            .build();

        ctx.accounts.policy_acc.last_reset_month = current_month;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![ResetMonthlySpendCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey: ctx.accounts.policy_acc.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "reset_monthly_spend")]
    pub fn reset_monthly_spend_callback(
        ctx: Context<ResetMonthlySpendCallback>,
        output: SignedComputationOutputs<ResetMonthlySpendOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(ResetMonthlySpendOutput { field_0 }) => field_0,
            Err(_) => return Err(PolicyError::AbortedComputation.into()),
        };

        ctx.accounts.policy_acc.encrypted_policy = o.ciphertexts;
        ctx.accounts.policy_acc.nonce = o.nonce;

        Ok(())
    }

    // ─── 5. UPDATE POLICY LIMITS (Owner-gated) ─────────────────────────────

    /// Replace auto_approve_limit / dual_approve_threshold / monthly_burn_cap.
    /// monthly_spent is preserved.
    pub fn update_policy_limits(
        ctx: Context<UpdatePolicyLimits>,
        computation_offset: u64,

        owner_encryption_pubkey: [u8; 32],
        owner_nonce: u128,
        encrypted_auto_approve_limit: [u8; 32],
        encrypted_dual_approve_threshold: [u8; 32],
        encrypted_monthly_burn_cap: [u8; 32],
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.payer.key(),
            ctx.accounts.policy_acc.authority,
            PolicyError::InvalidAuthority
        );

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        const POLICY_CTXT_OFFSET: u32 = 8 + 1 + 32 + 32;
        const POLICY_CTXT_LEN: u32 = 32 * 4;

        let args = ArgBuilder::new()
            .x25519_pubkey(owner_encryption_pubkey)
            .plaintext_u128(owner_nonce)
            .encrypted_u64(encrypted_auto_approve_limit)
            .encrypted_u64(encrypted_dual_approve_threshold)
            .encrypted_u64(encrypted_monthly_burn_cap)
            .plaintext_u128(ctx.accounts.policy_acc.nonce)
            .account(
                ctx.accounts.policy_acc.key(),
                POLICY_CTXT_OFFSET,
                POLICY_CTXT_LEN,
            )
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![UpdatePolicyLimitsCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey: ctx.accounts.policy_acc.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "update_policy_limits")]
    pub fn update_policy_limits_callback(
        ctx: Context<UpdatePolicyLimitsCallback>,
        output: SignedComputationOutputs<UpdatePolicyLimitsOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(UpdatePolicyLimitsOutput { field_0 }) => field_0,
            Err(_) => return Err(PolicyError::AbortedComputation.into()),
        };

        ctx.accounts.policy_acc.encrypted_policy = o.ciphertexts;
        ctx.accounts.policy_acc.nonce = o.nonce;

        emit!(PolicyLimitsUpdated {
            company_id: ctx.accounts.policy_acc.company_id,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// ═══ ACCOUNTS ═════════════════════════════════════════════════════════════

/// On-chain home of a single company's encrypted policy.
///
/// Layout (head): 8 disc | 1 bump | 32 company_id | 32 authority
/// Layout (cipher block at offset 73): 4 × 32-byte ciphertexts (the encrypted_policy field)
/// followed by nonce u128 + last_reset_month u8.
///
/// The ciphertext offset (73) MUST stay in sync with `POLICY_CTXT_OFFSET` in the
/// queue_computation args above.
#[account]
#[derive(InitSpace)]
pub struct ConfidentialPolicyAccount {
    pub bump: u8,
    pub company_id: [u8; 32],
    pub authority: Pubkey,
    /// 4 ciphertexts: auto_approve_limit, dual_approve_threshold, monthly_burn_cap, monthly_spent.
    /// Each 32 bytes (MXE Rescue ciphertext).
    pub encrypted_policy: [[u8; 32]; 4],
    pub nonce: u128,
    pub last_reset_month: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PolicyDecisionAccount {
    pub bump: u8,
    pub company_id: [u8; 32],
    pub payment_id: u64,
    pub requester: Pubkey,
    /// 2 ciphertexts: required_approvals (u8 padded), projected_monthly_spent (u64).
    pub encrypted_decision: [[u8; 32]; 2],
    pub decision_nonce: u128,
    pub status: DecisionStatus,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum DecisionStatus {
    Pending,
    Evaluated,
    Consumed, // marked when the main Black Budget program reads + acts on it
}

// ═══ EVENTS ═══════════════════════════════════════════════════════════════

#[event]
pub struct PolicyInitialized {
    pub company_id: [u8; 32],
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PolicyEvaluated {
    pub company_id: [u8; 32],
    pub payment_id: u64,
    pub requester: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SpendCommitted {
    pub company_id: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct PolicyLimitsUpdated {
    pub company_id: [u8; 32],
    pub timestamp: i64,
}

// ═══ ERROR CODES ══════════════════════════════════════════════════════════

#[error_code]
pub enum PolicyError {
    #[msg("MPC computation was aborted by the cluster")]
    AbortedComputation,
    #[msg("Caller is not the registered authority for this policy")]
    InvalidAuthority,
    #[msg("Monthly accumulator has already been reset this month")]
    AlreadyResetThisMonth,
    #[msg("Cluster not set on MXE account")]
    ClusterNotSet,
}

// ═══ INSTRUCTION ACCOUNTS — INIT COMP DEFS ════════════════════════════════
//
// One per circuit. Standard Arcium boilerplate; deployer runs each once.

#[init_computation_definition_accounts("init_company_policy", payer)]
#[derive(Accounts)]
pub struct InitInitPolicyCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("evaluate_policy", payer)]
#[derive(Accounts)]
pub struct InitEvalPolicyCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("commit_executed_payment", payer)]
#[derive(Accounts)]
pub struct InitCommitSpendCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("reset_monthly_spend", payer)]
#[derive(Accounts)]
pub struct InitResetMonthCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("update_policy_limits", payer)]
#[derive(Accounts)]
pub struct InitUpdateLimitsCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ═══ INSTRUCTION ACCOUNTS — QUEUE_COMPUTATION ════════════════════════════
//
// Each `#[queue_computation_accounts(...)]` produces the boilerplate set of
// Arcium-side accounts (sign_pda, mxe, mempool, exec pool, computation,
// comp_def, cluster, fee pool, clock, arcium program). We add our app-side
// PDAs.

#[queue_computation_accounts("init_company_policy", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, company_id: [u8; 32])]
pub struct InitCompanyPolicy<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: mempool_account, checked by the arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: executing_pool, checked by the arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_POLICY))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, PolicyError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(
        init,
        payer = payer,
        space = 8 + ConfidentialPolicyAccount::INIT_SPACE,
        seeds = [b"policy", company_id.as_ref()],
        bump,
    )]
    pub policy_acc: Account<'info, ConfidentialPolicyAccount>,
}

#[queue_computation_accounts("evaluate_policy", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, payment_id: u64)]
pub struct EvaluatePolicy<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: mempool_account, checked by the arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: executing_pool, checked by the arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_EVAL_POLICY))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, PolicyError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(mut, seeds = [b"policy", policy_acc.company_id.as_ref()], bump = policy_acc.bump)]
    pub policy_acc: Account<'info, ConfidentialPolicyAccount>,
    #[account(
        init,
        payer = payer,
        space = 8 + PolicyDecisionAccount::INIT_SPACE,
        seeds = [b"decision", policy_acc.company_id.as_ref(), &payment_id.to_le_bytes()],
        bump,
    )]
    pub decision_acc: Account<'info, PolicyDecisionAccount>,
}

#[queue_computation_accounts("commit_executed_payment", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CommitExecutedPayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: mempool_account, checked by the arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: executing_pool, checked by the arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMMIT_SPEND))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, PolicyError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(mut, seeds = [b"policy", policy_acc.company_id.as_ref()], bump = policy_acc.bump)]
    pub policy_acc: Account<'info, ConfidentialPolicyAccount>,
}

#[queue_computation_accounts("reset_monthly_spend", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, current_month: u8)]
pub struct ResetMonthlySpend<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_RESET_MONTH))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, PolicyError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(mut, seeds = [b"policy", policy_acc.company_id.as_ref()], bump = policy_acc.bump)]
    pub policy_acc: Account<'info, ConfidentialPolicyAccount>,
}

#[queue_computation_accounts("update_policy_limits", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct UpdatePolicyLimits<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, PolicyError::ClusterNotSet))]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_UPDATE_LIMITS))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, PolicyError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,

    #[account(mut, seeds = [b"policy", policy_acc.company_id.as_ref()], bump = policy_acc.bump)]
    pub policy_acc: Account<'info, ConfidentialPolicyAccount>,
}

// ═══ INSTRUCTION ACCOUNTS — CALLBACK CONTEXTS ════════════════════════════

#[callback_accounts("init_company_policy")]
#[derive(Accounts)]
pub struct InitCompanyPolicyCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_POLICY))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program via callback constraints.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, PolicyError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    /// CHECK: policy_acc, checked by callback_account key passed in queue_computation.
    #[account(mut)]
    pub policy_acc: Account<'info, ConfidentialPolicyAccount>,
}

#[callback_accounts("evaluate_policy")]
#[derive(Accounts)]
pub struct EvaluatePolicyCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_EVAL_POLICY))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, PolicyError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    /// CHECK: decision_acc
    #[account(mut)]
    pub decision_acc: Account<'info, PolicyDecisionAccount>,
    /// CHECK: policy_acc
    #[account(mut)]
    pub policy_acc: Account<'info, ConfidentialPolicyAccount>,
}

#[callback_accounts("commit_executed_payment")]
#[derive(Accounts)]
pub struct CommitExecutedPaymentCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMMIT_SPEND))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, PolicyError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    /// CHECK: policy_acc
    #[account(mut)]
    pub policy_acc: Account<'info, ConfidentialPolicyAccount>,
}

#[callback_accounts("reset_monthly_spend")]
#[derive(Accounts)]
pub struct ResetMonthlySpendCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_RESET_MONTH))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, PolicyError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    /// CHECK: policy_acc
    #[account(mut)]
    pub policy_acc: Account<'info, ConfidentialPolicyAccount>,
}

#[callback_accounts("update_policy_limits")]
#[derive(Accounts)]
pub struct UpdatePolicyLimitsCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_UPDATE_LIMITS))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, PolicyError::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    /// CHECK: policy_acc
    #[account(mut)]
    pub policy_acc: Account<'info, ConfidentialPolicyAccount>,
}
