use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k");

#[program]
pub mod black_budget {
    use super::*;

    /// Initialize a new company with a USDC vault (Token-2022)
    pub fn initialize_company(ctx: Context<InitCompany>, name: String) -> Result<()> {
        init_company::handle_init_company(ctx, name)
    }

    /// Add a member to the company with a specific role
    pub fn add_member(ctx: Context<AddMember>, role: Role, label: String) -> Result<()> {
        manage_members::handle_add_member(ctx, role, label)
    }

    /// Remove (deactivate) a member
    pub fn remove_member(ctx: Context<RemoveMember>) -> Result<()> {
        manage_members::handle_remove_member(ctx)
    }

    /// Set treasury policies (auto-approve limit, dual-approve threshold, etc.)
    pub fn set_policies(ctx: Context<SetPolicies>, policy: PolicyConfig) -> Result<()> {
        set_policies::handle_set_policies(ctx, policy)
    }

    /// Create a payment request (may auto-approve based on policy)
    pub fn create_payment(
        ctx: Context<CreatePayment>,
        amount: u64,
        category: PaymentCategory,
        description_hash: [u8; 32],
        memo: String,
        risk_score: u8,
    ) -> Result<()> {
        payments::handle_create_payment(ctx, amount, category, description_hash, memo, risk_score)
    }

    /// Approve a pending payment
    pub fn approve_payment(ctx: Context<ApprovePayment>) -> Result<()> {
        payments::handle_approve_payment(ctx)
    }

    /// Reject a pending payment
    pub fn reject_payment(ctx: Context<RejectPayment>) -> Result<()> {
        payments::handle_reject_payment(ctx)
    }

    /// Execute an approved payment (transfer USDC)
    pub fn execute_payment(ctx: Context<ExecutePayment>) -> Result<()> {
        payments::handle_execute_payment(ctx)
    }

    /// Anchor a selective disclosure proof on-chain
    pub fn record_proof(
        ctx: Context<RecordProof>,
        proof_type: ProofType,
        merkle_root: [u8; 32],
        payment_count: u32,
        period_start: i64,
        period_end: i64,
    ) -> Result<()> {
        record_proof::handle_record_proof(ctx, proof_type, merkle_root, payment_count, period_start, period_end)
    }
}
