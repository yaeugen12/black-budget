use anchor_lang::prelude::*;

/// Maximum number of members per company (keeps account size bounded)
pub const MAX_MEMBERS: usize = 20;
/// Maximum label length for member roles
pub const MAX_LABEL_LEN: usize = 32;
/// Maximum company name length
pub const MAX_NAME_LEN: usize = 64;

#[account]
#[derive(InitSpace)]
pub struct Company {
    /// The authority (founder) who created the company
    pub authority: Pubkey,
    /// Company display name
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    /// The company's USDC vault (Token-2022 account)
    pub vault: Pubkey,
    /// Treasury policy configuration
    pub policy: PolicyConfig,
    /// Total members count
    pub member_count: u8,
    /// Running payment counter (for payment IDs)
    pub payment_nonce: u64,
    /// Total USDC spent (tracked for burn rate)
    pub total_spent: u64,
    /// Monthly spend tracking (resets each month)
    pub monthly_spent: u64,
    /// Current month (1-12) for monthly reset
    pub current_month: u8,
    /// Timestamp of creation
    pub created_at: i64,
    /// PDA bump
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, Default)]
pub struct PolicyConfig {
    /// Payments under this amount (in USDC lamports, 6 decimals) auto-approve
    pub auto_approve_limit: u64,
    /// Payments over this amount require 2+ approvals
    pub dual_approve_threshold: u64,
    /// Maximum monthly spend (0 = unlimited)
    pub monthly_burn_cap: u64,
    /// Require verification for new vendors
    pub require_vendor_verification: bool,
    /// Block payments to unknown wallets
    pub restrict_to_known_recipients: bool,
    /// Minimum runway months before blocking discretionary spend
    /// If treasury balance / monthly_burn_rate < this → block non-payroll
    pub min_runway_months: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Member {
    /// Which company this member belongs to
    pub company: Pubkey,
    /// The member's wallet address
    pub wallet: Pubkey,
    /// Their role in the company
    pub role: Role,
    /// Human-readable label (e.g., "CFO", "Lead Dev")
    #[max_len(MAX_LABEL_LEN)]
    pub label: String,
    /// When they were added
    pub added_at: i64,
    /// Whether this member is active
    pub is_active: bool,
    /// PDA bump
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum Role {
    /// Full control: manage members, policies, approve, pay
    Owner,
    /// Can approve/reject payments, view all
    Approver,
    /// Read-only access + proof export
    Viewer,
    /// Can submit invoices / payment requests
    Contractor,
}

impl Role {
    pub fn can_approve(&self) -> bool {
        matches!(self, Role::Owner | Role::Approver)
    }

    pub fn can_execute(&self) -> bool {
        matches!(self, Role::Owner | Role::Approver)
    }

    pub fn can_create_payment(&self) -> bool {
        matches!(self, Role::Owner | Role::Approver | Role::Contractor)
    }

    pub fn can_manage_members(&self) -> bool {
        matches!(self, Role::Owner)
    }

    pub fn can_set_policies(&self) -> bool {
        matches!(self, Role::Owner)
    }

    pub fn can_export_proofs(&self) -> bool {
        // Everyone except contractors
        !matches!(self, Role::Contractor)
    }
}
