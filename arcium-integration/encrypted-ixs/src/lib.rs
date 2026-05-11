//! Black Budget — confidential policy circuits.
//!
//! Phase A of the Arcium integration (see `ARCIUM_INTEGRATION.md` §4 in the repo root).
//! Each circuit takes encrypted inputs from the client (shared key) and the company's
//! MXE-owned encrypted policy snapshot, then returns an encrypted decision.
//!
//! Nothing in this file is "policy logic on the public chain". All comparisons are
//! evaluated inside the MXE cluster on ciphertext-equivalent secret shares, and only
//! the encrypted output (`required_approvals`) leaks back to the host program.

use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    // ── Types ──────────────────────────────────────────────────────────────

    /// Plaintext shape of the payment request that the client encrypts under
    /// the shared (Client + MXE) key before submission. The Anchor program
    /// never sees these fields in the clear.
    pub struct PaymentRequest {
        /// Amount in USDC base units (6 decimals).
        pub amount: u64,
        /// Category enum encoded as u8 (0=Operating, 1=Payroll, 2=Vendor, 3=Contractor, 4=Admin, 5=Other).
        pub category: u8,
        /// Risk score from the off-chain AI parser (0-100). Stored for audit, not used in policy.
        pub risk_score: u8,
    }

    /// MXE-owned snapshot of the company's treasury policy + accumulator.
    ///
    /// Initialised once at `init_company_policy`, then mutated in-place by `evaluate_policy`.
    /// All fields are encrypted; only the MXE cluster can read/write.
    pub struct CompanyPolicy {
        /// Payments at or below this auto-approve immediately. 6 decimals.
        pub auto_approve_limit: u64,
        /// Payments at or above this require dual approval. 6 decimals. 0 = disabled.
        pub dual_approve_threshold: u64,
        /// Maximum cumulative monthly spend. 6 decimals. 0 = unlimited.
        pub monthly_burn_cap: u64,
        /// Running monthly spend (reset off-chain at month rollover via `reset_monthly_spend`).
        pub monthly_spent: u64,
    }

    /// Encrypted policy decision returned to the client.
    ///
    /// `required_approvals` semantics:
    ///   0   → auto-approved
    ///   1   → single signer required
    ///   2   → dual signer required
    ///   255 → REJECTED (would breach burn cap)
    pub struct PolicyDecision {
        pub required_approvals: u8,
        /// Updated monthly_spent IF the payment proceeds. Caller stores back into the
        /// MXE-owned CompanyPolicy on `execute_payment_callback`.
        pub projected_monthly_spent: u64,
    }

    // ── Instructions ───────────────────────────────────────────────────────

    /// Initialise MXE-owned encrypted policy storage for a new company.
    ///
    /// The client encrypts the initial policy values under the shared key and
    /// submits them; the MXE re-keys to its own internal storage so the company
    /// authority no longer needs to provide the key for subsequent reads/writes.
    #[instruction]
    pub fn init_company_policy(
        initial_policy_ctxt: Enc<Shared, CompanyPolicy>,
    ) -> Enc<Mxe, CompanyPolicy> {
        let p = initial_policy_ctxt.to_arcis();

        // Store internally under MXE-only key. Future evaluations read this directly.
        Mxe::get().from_arcis(p)
    }

    /// Confidential treasury policy evaluation.
    ///
    /// Inputs:
    /// - `request_ctxt`: encrypted payment request from the requester's wallet.
    /// - `policy_ctxt`:  MXE-owned encrypted policy snapshot for the company.
    ///
    /// Output:
    /// - `decision`: encrypted PolicyDecision under the requester's shared key.
    ///
    /// The decision encrypts the required_approvals tier; the on-chain program
    /// stores the ciphertext on the PaymentRequest PDA. The frontend decrypts
    /// it client-side to render the approval flow.
    ///
    /// IMPORTANT: This circuit does NOT mutate the policy. The policy account
    /// is read via `.account(policy_acc, ...)` on the host program and passes
    /// through unchanged. monthly_spent only advances in `commit_executed_payment`
    /// (called AFTER the SPL transfer succeeds), preventing the "create-and-cancel
    /// ramp" attack where pending payments inflate monthly_spent.
    #[instruction]
    pub fn evaluate_policy(
        request_ctxt: Enc<Shared, PaymentRequest>,
        policy_ctxt: Enc<Mxe, CompanyPolicy>,
    ) -> Enc<Shared, PolicyDecision> {
        let request = request_ctxt.to_arcis();
        let policy = policy_ctxt.to_arcis();

        // ── Burn cap check ──
        let would_exceed_cap = policy.monthly_burn_cap > 0
            && (policy.monthly_spent + request.amount) > policy.monthly_burn_cap;

        // ── Approval tier ──
        let required = if would_exceed_cap {
            255u8 // sentinel: rejected
        } else if request.amount <= policy.auto_approve_limit {
            0u8
        } else if policy.dual_approve_threshold > 0
            && request.amount >= policy.dual_approve_threshold
        {
            2u8
        } else {
            1u8
        };

        let projected = if would_exceed_cap {
            policy.monthly_spent
        } else {
            policy.monthly_spent + request.amount
        };

        let decision = PolicyDecision {
            required_approvals: required,
            projected_monthly_spent: projected,
        };

        request_ctxt.owner.from_arcis(decision)
    }

    /// Commit an executed payment's spend into the encrypted monthly accumulator.
    ///
    /// Called from the Anchor program's `execute_payment` AFTER the SPL transfer
    /// has succeeded. The `projected_monthly_spent` value is supplied directly
    /// (encrypted under the shared key) so the MXE doesn't need to recompute.
    ///
    /// Returns the updated MXE-owned policy with monthly_spent advanced.
    #[instruction]
    pub fn commit_executed_payment(
        projected_ctxt: Enc<Shared, u64>,
        policy_ctxt: Enc<Mxe, CompanyPolicy>,
    ) -> Enc<Mxe, CompanyPolicy> {
        let projected = projected_ctxt.to_arcis();
        let mut policy = policy_ctxt.to_arcis();

        // Use max() to make this idempotent under retries: even if the client
        // submits the same projected value twice (e.g. via reorg), monthly_spent
        // never decreases.
        if projected > policy.monthly_spent {
            policy.monthly_spent = projected;
        }

        Mxe::get().from_arcis(policy)
    }

    /// Reset the encrypted monthly_spent accumulator to zero.
    ///
    /// Called once per calendar month rollover. The Anchor program checks the
    /// current month against the company's last_reset_month and triggers this
    /// when they differ — this happens on-chain in plaintext (just the boundary
    /// check), the reset itself happens inside the MXE.
    #[instruction]
    pub fn reset_monthly_spend(
        policy_ctxt: Enc<Mxe, CompanyPolicy>,
    ) -> Enc<Mxe, CompanyPolicy> {
        let mut policy = policy_ctxt.to_arcis();
        policy.monthly_spent = 0;
        Mxe::get().from_arcis(policy)
    }

    /// Update mutable policy parameters (auto-approve, dual-approve, burn cap).
    ///
    /// Called by the company Owner on `set_policies`. The new values arrive
    /// encrypted under the Owner's shared key; the MXE replaces the limits in
    /// the encrypted storage while preserving the running monthly_spent.
    #[instruction]
    pub fn update_policy_limits(
        new_auto_ctxt: Enc<Shared, u64>,
        new_dual_ctxt: Enc<Shared, u64>,
        new_cap_ctxt: Enc<Shared, u64>,
        policy_ctxt: Enc<Mxe, CompanyPolicy>,
    ) -> Enc<Mxe, CompanyPolicy> {
        let mut policy = policy_ctxt.to_arcis();
        policy.auto_approve_limit = new_auto_ctxt.to_arcis();
        policy.dual_approve_threshold = new_dual_ctxt.to_arcis();
        policy.monthly_burn_cap = new_cap_ctxt.to_arcis();
        Mxe::get().from_arcis(policy)
    }
}
