use anchor_lang::prelude::*;

/// Maximum number of approvals tracked per payment
pub const MAX_APPROVALS: usize = 5;
/// Maximum description hash (SHA-256)
pub const HASH_SIZE: usize = 32;
/// Maximum memo length
pub const MAX_MEMO_LEN: usize = 128;

#[account]
#[derive(InitSpace)]
pub struct PaymentRequest {
    /// The company this payment belongs to
    pub company: Pubkey,
    /// Who requested this payment
    pub requester: Pubkey,
    /// Who receives the funds
    pub recipient: Pubkey,
    /// Amount in USDC lamports (6 decimals)
    pub amount: u64,
    /// Payment category
    pub category: PaymentCategory,
    /// SHA-256 hash of the invoice/description (off-chain data)
    pub description_hash: [u8; HASH_SIZE],
    /// Short memo (on-chain, visible to company members)
    #[max_len(MAX_MEMO_LEN)]
    pub memo: String,
    /// Current status
    pub status: PaymentStatus,
    /// List of wallets that approved
    #[max_len(MAX_APPROVALS)]
    pub approvals: Vec<Pubkey>,
    /// How many approvals are needed
    pub required_approvals: u8,
    /// Payment nonce (sequential ID within company)
    pub payment_id: u64,
    /// AI-assigned risk score (0-100, from backend)
    pub risk_score: u8,
    /// When created
    pub created_at: i64,
    /// When executed (0 if not yet)
    pub executed_at: i64,
    /// PDA bump
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum PaymentStatus {
    /// Waiting for approvals
    Pending,
    /// All approvals received, ready to execute
    Approved,
    /// Funds transferred
    Executed,
    /// Rejected by an approver
    Rejected,
    /// Cancelled by requester
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PaymentCategory {
    Payroll,
    Vendor,
    Subscription,
    Contractor,
    Reimbursement,
    Other,
}

impl PaymentCategory {
    pub fn is_discretionary(&self) -> bool {
        matches!(self, PaymentCategory::Vendor | PaymentCategory::Subscription | PaymentCategory::Other)
    }
}

/// On-chain proof record — records that a selective disclosure was generated
#[account]
#[derive(InitSpace)]
pub struct ProofRecord {
    /// Company
    pub company: Pubkey,
    /// Who generated the proof
    pub generated_by: Pubkey,
    /// Proof type
    pub proof_type: ProofType,
    /// Merkle root of the included payments
    pub merkle_root: [u8; 32],
    /// Period start timestamp
    pub period_start: i64,
    /// Period end timestamp
    pub period_end: i64,
    /// Number of payments included
    pub payment_count: u32,
    /// Timestamp of generation
    pub generated_at: i64,
    /// PDA bump
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ProofType {
    /// Investor: sees aggregates only (burn rate, runway, category split)
    Investor,
    /// Auditor: sees all amounts + categories, pseudonymized vendors
    Auditor,
    /// Regulator: full disclosure
    Regulator,
}

/// On-chain compliance proof — records a YES/NO answer to a parametric query
#[account]
#[derive(InitSpace)]
pub struct ComplianceProof {
    /// Company
    pub company: Pubkey,
    /// Who generated the proof
    pub generated_by: Pubkey,
    /// SHA-256 of the canonical query definition (deterministic)
    pub constraint_hash: [u8; 32],
    /// Merkle root of the underlying payment dataset
    pub merkle_root: [u8; 32],
    /// The boolean result: true = compliant, false = non-compliant
    pub result: bool,
    /// Number of payments in the dataset
    pub payment_count: u32,
    /// Period start
    pub period_start: i64,
    /// Period end
    pub period_end: i64,
    /// When anchored
    pub generated_at: i64,
    /// PDA bump
    pub bump: u8,
}
