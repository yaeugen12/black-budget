# Black Budget × Arcium — Production Integration Spec

**Goal**: Move Black Budget from "off-chain selective disclosure" to **end-to-end encrypted treasury operations** using Arcium's MPC network as a confidential compute coprocessor on Solana.

**Status**: Architecture spec, not yet implemented. Production integration plan for post-hackathon (Q3-Q4 2026). Grounded in Arcium **Mainnet Alpha** (live since Feb 2026) and the **Confidential SPL** standard (Q1 2026).

**Source docs**: [docs.arcium.com](https://docs.arcium.com), [Arcium Mainnet Alpha announcement (Feb 2026)](https://arcium.substack.com/p/arcium-mainnet-alpha-is-live), [Confidential SPL keynote @ Breakpoint 2025](https://solanacompass.com/learn/breakpoint-25/keynote-arcium-yannik-schrade).

---

## 1. Why Arcium and not the alternatives

| Stack | Solana-native | Live mainnet | Encrypts amounts | Encrypts compute | Lift |
|-------|---------------|--------------|------------------|------------------|------|
| **Token-2022 Confidential Transfer** | ✓ | ⚠ ZK ElGamal disabled on mainnet | ✓ (when re-enabled) | ✗ (transfer only) | 0 (already provisioned on our mint) |
| **Arcium MXE** | ✓ | ✓ Alpha since Feb 2026 | ✓ via Confidential SPL | **✓ programmable** | 2-4 weeks per circuit |
| **Light Protocol** | ✓ | ✓ | partial (compressed) | ✗ (no compute) | 1-2 weeks (stealth addresses) |
| **Inco Network (FHE)** | ✗ EVM | ✓ | ✓ | ✓ | High (cross-chain) |

**Decision**: Arcium is the only stack that lets us encrypt **both amounts AND the policy logic** that operates on them, while staying native Solana. Token-2022 CT only encrypts the transfer; the *creation/approval/policy-check* still leaks. Arcium covers the whole loop.

---

## 2. The three-tier privacy architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Tier 1 — Application layer (live today on Devnet, commit 64f80dd) │
│ Selective disclosure via off-chain Merkle redaction              │
│ Investor / Auditor / Regulator views from same root              │
└─────────────────────────────────────────────────────────────────┘
                                ↓ ADDS
┌─────────────────────────────────────────────────────────────────┐
│ Tier 2 — Protocol layer (Q3 2026 — Arcium Confidential SPL)      │
│ Encrypted balances + encrypted transfers via Arcium CSPL token   │
│ Replaces dependency on ZK ElGamal Proof program returning        │
└─────────────────────────────────────────────────────────────────┘
                                ↓ ADDS
┌─────────────────────────────────────────────────────────────────┐
│ Tier 3 — Compute layer (Q4 2026 — Arcium MXE)                    │
│ Policy evaluation, compliance proofs, Merkle generation in MPC   │
│ Plaintext invoice data never leaves trusted enclaves             │
└─────────────────────────────────────────────────────────────────┘
```

Each tier composes additively. Tier 1 ships today. Tiers 2-3 are the post-hackathon roadmap.

---

## 3. What moves to Arcium (per-instruction)

Mapping each of Black Budget's 10 on-chain instructions to its integration phase:

| Instruction | Sensitivity | Phase | Action |
|---|---|---|---|
| `init_company` | Authority, name | — | Keep on-chain. Public by design. |
| `set_policies` | **Burn cap, thresholds** | **A** | Move policy values to encrypted state; CompDef stores ciphertext. |
| `add_member` / `remove_member` | Role assignments | C | Keep on-chain v1. Encrypted role table in v2 (Phase C). |
| `create_payment` | **Amount, recipient, category** | **A + B** | Phase A: encrypted amount + encrypted policy eval. Phase B: amount stored in Confidential SPL. |
| `approve_payment` | Approver linkage | C | Encrypted "which payment did approver X sign?" v2. |
| `reject_payment` | Linkage | C | Same as approve. |
| `execute_payment` | **Amount, recipient** | **B** | Replace `token_2022::transfer_checked` with Confidential SPL transfer. |
| `record_proof` | Already commitment | — | Keep on-chain. Root is already encrypted-equivalent. |
| `record_compliance_proof` | **Constraint computation** | **D** | Move constraint evaluation to MXE; on-chain stores result + constraint hash only. |
| (new) `evaluate_policy_mxe` | — | A | New MXE invocation instruction. Queues confidential computation. |

**Phases ordered by ROI/lift ratio**:

- **Phase A — Encrypted Policy Evaluation** (Q3 2026, 2-3 weeks lift, high impact)
- **Phase B — Confidential SPL Token** (Q3 2026, 2 weeks lift, very high impact)
- **Phase C — Compliance Proofs in MXE** (Q4 2026, 1-2 weeks lift, medium impact)
- **Phase D — Encrypted Merkle Generation** (Q4 2026, 1 week lift, low-medium impact)

---

## 4. Phase A — Encrypted Policy Evaluation

### 4.1 Threat model gap closed

**Today**: `create_payment` takes amount as `u64` plaintext, compares to `policy.monthly_burn_cap`, `auto_approve_limit`, `dual_approve_threshold` (all plaintext on-chain). A blockchain analyzer can:
- Read your burn cap from any `set_policies` transaction
- Watch incoming `PaymentCreated` events and back out individual amounts
- Correlate amounts with vendor categories to map your cost structure

**After Phase A**: amounts and policy thresholds are encrypted. The policy comparison (`amount <= auto_approve_limit ? 0 : (amount >= dual_threshold ? 2 : 1)`) executes inside an Arcium MXE. The on-chain transaction reveals only:
- Payment exists (size of ciphertext, not amount)
- Encrypted output: required_approvals as ciphertext

### 4.2 Arcis circuit

```rust
// File: encrypted-ixs/src/lib.rs (new package)
use arcis_imports::*;

#[encrypted]
mod circuits {
    /// Confidential policy evaluation.
    /// Inputs are encrypted under the company's shared-secret key.
    /// Output (required_approvals) is encrypted under the same key
    /// so only the company's frontend / authorized members can decrypt.
    #[derive(ArcisType, ArcisEncryptable, Copy, Clone)]
    pub struct PolicyInputs {
        pub amount: u64,
        pub auto_approve_limit: u64,
        pub dual_approve_threshold: u64,
        pub monthly_spent: u64,
        pub monthly_burn_cap: u64,
    }

    #[instruction]
    pub fn evaluate_policy(input_ctxt: Enc<Shared, PolicyInputs>)
        -> Enc<Shared, u8>
    {
        let input = input_ctxt.to_arcis();

        // Burn cap check — produces a sentinel value 255 = "REJECT"
        let would_exceed_cap = input.monthly_spent + input.amount > input.monthly_burn_cap;

        // Approval tier computation
        let required = if would_exceed_cap {
            255u8 // sentinel: reject
        } else if input.amount <= input.auto_approve_limit {
            0u8
        } else if input.amount >= input.dual_approve_threshold {
            2u8
        } else {
            1u8
        };

        input_ctxt.owner.from_arcis(required)
    }
}
```

### 4.3 Anchor program changes

```rust
// programs/black_budget/src/instructions/payments.rs

use arcium_anchor::prelude::*;
use arcium_client::cpi::queue_computation;

// 1. NEW: init the computation definition (run once at deploy)
pub fn init_evaluate_policy_comp_def(ctx: Context<InitPolicyCompDef>) -> Result<()> {
    // Standard Arcium boilerplate — registers the policy circuit with MXE
    init_comp_def(ctx.accounts.into(), COMP_DEF_OFFSET_EVAL_POLICY)?;
    Ok(())
}

// 2. MODIFIED: create_payment now queues an MXE computation
pub fn handle_create_payment(
    ctx: Context<CreatePayment>,
    encrypted_amount: [u8; 32],         // x25519+Rescue ciphertext of u64
    amount_nonce: u128,
    payment_pubkey: [u8; 32],            // client x25519 pubkey for callback
    category: PaymentCategory,
    description_hash: [u8; 32],
    memo: String,
    risk_score: u8,
) -> Result<()> {
    // ... unchanged validations: requester != recipient, memo length, etc.

    let payment = &mut ctx.accounts.payment;
    payment.encrypted_amount = encrypted_amount;
    payment.amount_nonce = amount_nonce;
    payment.payment_pubkey = payment_pubkey;
    payment.status = PaymentStatus::PolicyEvaluating;  // NEW state
    // ... rest of init

    // Queue MXE computation: evaluate_policy(encrypted_amount, company.encrypted_policy)
    let args = vec![
        Argument::Encrypted(encrypted_amount),
        Argument::Account(ctx.accounts.company.key()), // pulls encrypted policy from company PDA
    ];

    queue_computation(
        ctx.accounts.into(),
        args,
        COMP_DEF_OFFSET_EVAL_POLICY,
        CALLBACK_PAYMENT_CREATED,
    )?;

    Ok(())
}

// 3. NEW: callback when MXE finishes — finalizes payment state
pub fn handle_evaluate_policy_callback(
    ctx: Context<EvaluatePolicyCallback>,
    output: ComputationOutputs,
) -> Result<()> {
    let required_approvals_ctxt = output.expect_encrypted()?;

    let payment = &mut ctx.accounts.payment;

    // Store the encrypted output. Frontend decrypts via shared secret.
    payment.encrypted_required_approvals = required_approvals_ctxt.ciphertext;

    // State transitions to "PolicyEvaluated" — frontend now reads the
    // encrypted required_approvals, decrypts, and shows the user
    // either "auto-approved", "needs N signers", or "rejected by policy".
    payment.status = PaymentStatus::PolicyEvaluated;

    emit!(PaymentPolicyEvaluated {
        company: payment.company,
        payment_id: payment.payment_id,
        // Note: no plaintext amount or approval count in the event.
    });

    Ok(())
}
```

### 4.4 Client-side flow

```typescript
// app/src/lib/arcium-client.ts (new)
import {
  getMXEPublicKey,
  generateClientKeypair,
  deriveSharedSecret,
  RescueCipher,
} from "@arcium-hq/client";

export async function createPaymentConfidential(
  program: BlackBudgetProgram,
  amount: bigint,
  policy: PolicyConfig,
  monthlySpent: bigint,
  recipient: PublicKey,
  category: PaymentCategory,
) {
  // 1. Generate ephemeral keypair for this payment
  const clientKp = generateClientKeypair();

  // 2. Fetch MXE cluster's pubkey
  const mxePubkey = await getMXEPublicKey(program.provider.connection, MXE_ADDRESS);

  // 3. Derive shared secret + init Rescue cipher
  const sharedSecret = deriveSharedSecret(clientKp.secretKey, mxePubkey);
  const cipher = new RescueCipher(sharedSecret);

  // 4. Encrypt the full PolicyInputs struct
  const nonce = randomNonce();
  const inputs = [
    bigintToBytes(amount, 8),
    bigintToBytes(policy.autoApproveLimit, 8),
    bigintToBytes(policy.dualApproveThreshold, 8),
    bigintToBytes(monthlySpent, 8),
    bigintToBytes(policy.monthlyBurnCap, 8),
  ];
  const ciphertext = cipher.encrypt(Buffer.concat(inputs), nonce);

  // 5. Send instruction
  await program.methods
    .createPayment(
      Array.from(ciphertext.slice(0, 32)),
      new BN(nonce.toString()),
      Array.from(clientKp.publicKey),
      category,
      descriptionHash,
      memo,
      riskScore,
    )
    .accounts({ ... })
    .rpc();

  // 6. Wait for callback event — Arcium MXE typically responds in 5-15s
  const required = await waitForPaymentEvaluated(program, paymentId);
  const requiredApprovals = cipher.decrypt(required.encryptedRequiredApprovals, nonce);

  return { paymentId, requiredApprovals: bytesToU8(requiredApprovals) };
}
```

### 4.5 New on-chain state

```rust
// programs/black_budget/src/state/payment.rs

// ADDED FIELDS (existing PaymentRequest extends with):
pub encrypted_amount: [u8; 32],            // ciphertext of u64
pub amount_nonce: u128,                    // nonce for client→MXE
pub payment_pubkey: [u8; 32],              // client x25519 pubkey
pub encrypted_required_approvals: [u8; 32], // MXE output ciphertext

// MODIFIED ENUM:
pub enum PaymentStatus {
    PolicyEvaluating,  // NEW — waiting for MXE callback
    PolicyEvaluated,   // NEW — MXE returned, frontend decrypts
    Pending,           // requires approvals
    Approved,
    Executed,
    Rejected,
}
```

### 4.6 What stays plaintext (and why that's OK)

- **`recipient`**: still plaintext. To transfer Confidential SPL tokens, the recipient ATA must exist; addresses on Solana are inherently public. Stealth addresses (Phase E, via Light Protocol) would close this.
- **`requester` / `executor`**: signers are public by Solana design.
- **`payment_id` / `created_at`**: aggregate cadence info.

Phase A closes the **amount + policy decision** leak — the largest single source of competitive intelligence in Black Budget's current model.

---

## 5. Phase B — Confidential SPL Token

### 5.1 What ships in Q1 2026

Per Arcium's [Breakpoint 2025 keynote](https://solanacompass.com/learn/breakpoint-25/keynote-arcium-yannik-schrade): Confidential SPL (CSPL) is "an extension of Solana's SPL token model that enables programmable, privacy-preserving logic, rather than just private balances or transfers."

This means CSPL is **strictly stronger than Token-2022 Confidential Transfer**:
- Token-2022 CT: encrypted balances + encrypted amount on transfer. Compute on amounts requires decryption.
- CSPL: encrypted balances + encrypted transfers + **programmable logic that operates on encrypted state** (e.g., "transfer up to X% of balance" enforced without revealing balance).

### 5.2 Migration

```rust
// Cargo.toml — replace anchor_spl::token_2022 with arcium-cspl
[dependencies]
arcium-anchor = "0.10"
arcium-cspl = "0.5"  // Confidential SPL token interface
```

```rust
// programs/black_budget/src/instructions/payments.rs::handle_execute_payment

// BEFORE (current code, payments.rs:434):
token_2022::transfer_checked(cpi_ctx, payment.amount, 6)?;

// AFTER (Phase B):
arcium_cspl::transfer_confidential(
    cpi_ctx,
    payment.encrypted_amount,
    payment.amount_nonce,
    /* destination_pubkey */ recipient_x25519_pubkey,
)?;
```

The vault PDA constraint (`payments.rs:362-369`) stays. CSPL accounts have the same PDA derivation conventions as standard SPL. Migration is a 1-week effort: type substitution, IDL regeneration, frontend client update.

### 5.3 Hybrid period

While CSPL ecosystem matures (wallets need to support encrypted balance display, indexers need new RPC methods), Black Budget supports BOTH:
- **Default vault**: CSPL USDC
- **Legacy vault**: Token-2022 USDC (current implementation)
- Per-company flag set at `init_company` time

This avoids a forced ecosystem dependency before downstream tools catch up.

---

## 6. Phase C — Compliance Proofs in MXE

### 6.1 Current shape (Tier 1)

Today's `record_compliance_proof` takes a result (bool) and constraint hash computed client-side. The client has plaintext access to all payment data, computes the constraint, anchors the result. Trust model: **trust the client** (which is the company itself).

### 6.2 With MXE (Phase C)

The constraint computation moves to MXE. The client provides encrypted inputs; the MXE evaluates the constraint and returns the encrypted result. The on-chain anchor now references a computation that **the company itself cannot fabricate** — the MPC cluster signed off on the result.

### 6.3 Example circuit — "is admin spend < 30% of total?"

```rust
#[encrypted]
mod compliance_circuits {
    #[derive(ArcisType, ArcisEncryptable, Copy, Clone)]
    pub struct AdminSpendInputs {
        pub admin_total: u64,    // sum of category=Admin payments
        pub grand_total: u64,    // sum of all payments
        pub threshold_bps: u16,  // basis points (3000 = 30%)
    }

    #[instruction]
    pub fn admin_spend_within(input_ctxt: Enc<Shared, AdminSpendInputs>)
        -> Enc<Shared, ComplianceResult>
    {
        let input = input_ctxt.to_arcis();

        // admin_total * 10000 < grand_total * threshold_bps
        let result = if input.grand_total == 0 {
            ComplianceResult { passed: false, ratio_bps: 0 }
        } else {
            let actual_bps = (input.admin_total * 10000) / input.grand_total;
            ComplianceResult {
                passed: actual_bps < input.threshold_bps as u64,
                ratio_bps: actual_bps as u16,
            }
        };

        input_ctxt.owner.from_arcis(result)
    }
}
```

Result: the on-chain `ComplianceProof` PDA stores a trustworthy `passed: true` flag — independent verifiers know it came from MPC cluster consensus, not client wishful arithmetic.

---

## 7. Phase D — Encrypted Merkle Generation

### 7.1 Goal

Today's Merkle tree is built client-side from on-chain payment data. The plaintext data passes through one party's machine (the proof generator). After Phase B, on-chain amounts are encrypted — but generating the Merkle tree still requires decryption client-side.

Phase D moves the **Merkle tree construction** into MXE. The MPC cluster reads encrypted payment data from on-chain, builds the tree internally, exports only:
- The root (a 32-byte commitment)
- The redacted view per audience (encrypted under each audience's pubkey)

Plaintext payment-level data **never leaves the cluster**.

### 7.2 Circuit sketch

```rust
#[encrypted]
mod proof_circuits {
    #[instruction]
    pub fn build_investor_view(
        payments_ctxt: Enc<Shared, Vec<PaymentLeaf>>,
        investor_pubkey: [u8; 32],
    ) -> Enc<Shared, InvestorView> {
        let payments = payments_ctxt.to_arcis();

        // Aggregate without revealing individual rows
        let total_spent: u64 = payments.iter().map(|p| p.amount).sum();
        let category_breakdown = aggregate_by_category(&payments);

        // Compute Merkle root
        let leaves: Vec<[u8; 32]> = payments.iter().map(|p| p.hash()).collect();
        let root = merkle_root(&leaves);

        let view = InvestorView { total_spent, category_breakdown, root };
        let investor = ArcisOwner::from_pubkey(investor_pubkey);
        investor.from_arcis(view)
    }
}
```

The on-chain `record_proof` then accepts the **MXE-attested root** (signed by the cluster) instead of a client-provided root. This is the strongest possible non-interactive proof: "no party with plaintext access produced this view."

---

## 8. Cost & latency budget

> Specific latency numbers not yet published for Mainnet Alpha (per [Arcium blog Feb 2026](https://arcium.substack.com/p/arcium-mainnet-alpha-is-live)). The Alpha is "focused on reliability and usability... gather performance benchmarks." These are PLANNING ESTIMATES — must be benchmarked against real Mainnet Alpha clusters before production cutover.

### Working assumptions

| Operation | Estimated latency | Estimated cost | Notes |
|---|---|---|---|
| `evaluate_policy` MXE call | 5-15s end-to-end | ~$0.05-0.20 per call | Small input (~50 bytes), simple comparison. Solana TX itself <1s; rest is MPC. |
| `admin_spend_within` MXE call | 8-20s | ~$0.10-0.30 | Larger input, more aggregation. |
| `build_investor_view` MXE call | 30-90s | ~$1-3 | Variable on N payments. Acceptable for end-of-month proof generation. |
| `transfer_confidential` (CSPL) | 2-5s | ~$0.01-0.05 | Closer to Token-2022 CT, lighter than full MPC. |

### UX implications

**Phase A** (policy eval): 5-15s wait between "Create Payment" click and "Payment created with N approvals required". Frontend shows progress spinner. **Acceptable** because:
- Today's flow already requires Phantom signing latency (~2-5s)
- B2B finance ops are not time-critical at the second granularity
- Latency replaces the manual approval-routing question ("who do I send this to?")

**Phase B** (transfer): same latency band as Token-2022 CT (which Black Budget already commits to). No UX regression.

**Phase C/D** (compliance + Merkle): batch operations. Run end-of-period, not interactively. Latency irrelevant.

---

## 9. Trust model — what changes

### Today (Tier 1 only)

| Adversary | Can see | Mitigation |
|---|---|---|
| Public chain observer | All payments, amounts, recipients, cadence | NONE (it's a public chain) |
| Compromised proof generator (client) | All plaintext data | Trust the company itself |
| Curious indexer | Aggregate company stats | NONE |

### After Phase A+B

| Adversary | Can see | Mitigation |
|---|---|---|
| Public chain observer | Payment cadence, recipient addresses | Stealth addresses (future Phase E) |
| Compromised proof generator | View this MXE generated for them | Cannot generate arbitrary views |
| Curious indexer | Payment count, encrypted ciphertext sizes | Acceptable metadata leak |
| **MPC cluster collusion** (>threshold malicious nodes) | Plaintext during computation | Cluster size + economic security via $ARC staking |

### After Phase C+D

Adds: even the company's own proof-generation process is auditable. The MXE attests that the Merkle root came from a specific set of encrypted inputs — the company cannot quietly omit a payment.

This is the **strongest trust model achievable** for treasury operations: company controls its data, but verifiers know the data wasn't tampered with at proof-time.

---

## 10. Integration milestones (post-hackathon roadmap)

> Calendar dates assume hackathon submission late May 2026 → integration starts June 2026.

| Milestone | Target | Effort | Dependencies |
|---|---|---|---|
| **M1**: Arcium devnet setup, `arcup` CLI installed, hello-world circuit deployed | June W1 | 2 days | Arcium docs |
| **M2**: Phase A circuit (`evaluate_policy`) deployed to devnet MXE | June W2 | 4 days | M1 |
| **M3**: Anchor program forks with `init_evaluate_policy_comp_def` + callback handler | June W3 | 5 days | M2; existing test suite |
| **M4**: Client SDK wrapper (`createPaymentConfidential` in `app/src/lib/arcium-client.ts`) | June W4 | 4 days | M3; @arcium-hq/client npm pkg |
| **M5**: Full Phase A end-to-end test on Arcium devnet | July W1 | 3 days | M1-M4 |
| **M6**: CSPL availability check + migration spike | July W2 | 5 days | Arcium CSPL launch (Q1 2026, may need pre-release SDK) |
| **M7**: Phase B implementation + dual-vault hybrid mode | July W3-W4 | 8 days | M6 |
| **M8**: Mainnet alpha cluster benchmark; tune timeouts | August W1 | 3 days | M5+M7 on devnet |
| **M9**: Phase A+B mainnet deploy | August W2 | 5 days | M8; gas budget; security review |
| **M10**: Phase C (compliance circuits) on devnet | August W3-W4 | 7 days | M5; finalized constraint library |
| **M11**: Phase D (encrypted Merkle generator) | September W1-W2 | 8 days | M10 |
| **M12**: Phase C+D mainnet | September W3 | 5 days | M11; second security review |

**Total**: ~12 weeks for full Tier 2 + Tier 3 production. Realistic ship date: late September 2026.

**Critical-path risks**:
1. CSPL launch slippage → Phase B blocked → Tier 2 partial (Token-2022 CT fallback)
2. Mainnet Alpha latency higher than Devnet → UX redesign needed (more progress indicators)
3. MXE cluster availability during off-hours → policy eval timeouts → need graceful fallback to on-chain plaintext eval (with audit log)

---

## 11. Code touchpoints (existing Black Budget files)

> When implementation begins, these are the exact files that change. Useful for scoping PRs.

### Phase A touchpoints

| File | Change |
|---|---|
| `programs/black_budget/Cargo.toml` | Add `arcium-anchor`, `arcium-client`, `arcium-macros` deps |
| `programs/black_budget/src/lib.rs` | Register 2 new instructions: `init_evaluate_policy_comp_def`, `evaluate_policy_callback` |
| `programs/black_budget/src/instructions/payments.rs` | Modify `handle_create_payment` to queue MXE; new `EvaluatePolicyCallback` accounts struct |
| `programs/black_budget/src/state/payment.rs` | Add encrypted_amount, amount_nonce, payment_pubkey, encrypted_required_approvals, PolicyEvaluating/PolicyEvaluated statuses |
| `programs/black_budget/src/state/company.rs` | Move `policy: PolicyConfig` to `encrypted_policy: [u8; N]` (or keep plaintext as fallback) |
| (new) `encrypted-ixs/src/lib.rs` | Arcis circuit: `evaluate_policy` |
| `app/src/lib/arcium-client.ts` (new) | Client wrapper, Rescue cipher, MXE pubkey fetch |
| `app/src/lib/program.ts` | `createPayment` call site routes to `createPaymentConfidential` |
| `tests/full-flow-test.mjs` | New test: `test_confidential_policy_eval` |

### Phase B touchpoints

| File | Change |
|---|---|
| `programs/black_budget/Cargo.toml` | Replace `anchor-spl` token_2022 deps with `arcium-cspl` |
| `programs/black_budget/src/instructions/init_company.rs` | Create CSPL vault instead of Token-2022 vault; add `confidential: bool` flag |
| `programs/black_budget/src/instructions/payments.rs` | Replace `transfer_checked` with `arcium_cspl::transfer_confidential` |
| `Anchor.toml` | Pin CSPL program ID (once published) |
| `app/src/lib/program.ts` | New balance fetcher using CSPL API |
| `app/src/components/onboarding.tsx` | Add "Confidential vault" toggle (default ON) at company creation |

---

## 12. Open questions to resolve before implementation

1. **CSPL public availability**: confirm exact program ID + crate version when starting M6
2. **Cluster selection**: permissioned vs permissionless cluster — does Black Budget operate its own MXE cluster for SLA guarantees, or use shared mainnet clusters?
3. **Pricing finalization**: Arcium has not published per-computation cost. Budget assumes ~$0.05-3 per call. Must benchmark before M9.
4. **Fallback policy**: if MXE cluster down, does Black Budget reject new payments or fall back to plaintext eval with audit log entry? Recommended: fail-safe to plaintext + visible WARNING banner in UI.
5. **Multi-region clusters**: latency-sensitive ops should pin to nearest cluster. Need to validate cluster geographic distribution.
6. **Audit re-pass on Phase A code**: encrypted code is harder to audit. Recommend dedicated security pass on the Arcis circuit + the Anchor↔MXE state machine before mainnet.

---

## 13. Why this is the right post-hackathon investment

- **Solves the actual narrative gap**: today's pitch claims "private treasury" but on-chain amounts are public. Arcium closes that loop authentically.
- **Solana-native**: no cross-chain bridge, no L2, no different VM. Vault stays on Solana mainnet.
- **Composable**: Phase A doesn't require Phase B. Each phase ships independently and gives standalone privacy gains.
- **Ecosystem alignment**: Arcium token + Confidential SPL is part of Solana's privacy roadmap. Building on it tracks toward where Solana itself is going.
- **Defensible moat**: most competitors (Squads, Request, Utopia) cannot integrate Arcium without rebuilding their entire data model. Black Budget's architecture (PDA-per-payment + Merkle-root proofs) is already aligned for MPC.

---

**Maintained**: 2026-05-11. Update when Arcium publishes Mainnet Alpha benchmarks, when CSPL launches, and after each implementation milestone.

**Sources**:
- [Arcium Mainnet Alpha announcement (Feb 2026)](https://arcium.substack.com/p/arcium-mainnet-alpha-is-live)
- [Arcium docs index](https://docs.arcium.com)
- [Confidential SPL keynote — Breakpoint 2025](https://solanacompass.com/learn/breakpoint-25/keynote-arcium-yannik-schrade)
- [Arcium Mainnet Alpha — Messari report](https://messari.io/report/arcium-mainnet-alpha-release)
- [Privacy 2.0 for Solana — Helius blog](https://www.helius.dev/blog/solana-privacy)
