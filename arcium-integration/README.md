# Black Budget × Arcium — Phase A Implementation

Self-contained sub-project that implements **Phase A — Encrypted Policy Evaluation** of the `ARCIUM_INTEGRATION.md` spec.

This directory is **independent** of the main Black Budget Anchor program: it has its own `Cargo.toml` (workspace), its own `Anchor.toml`, its own `Arcium.toml`. The main `programs/black_budget/` is untouched, so the existing build, tests, and deployment continue to work without an Arcium toolchain installed.

When Phase A is brought online, Black Budget's frontend orchestrates two calls per payment:
1. `confidential_policy.evaluate_policy(...)` → encrypted decision
2. `black_budget.create_payment(...)` with the encrypted amount and decision PDA

## What's here

```
arcium-integration/
├── Anchor.toml                    # workspace (Anchor 0.32.1)
├── Arcium.toml                    # MXE cluster config
├── Cargo.toml                     # Rust workspace
├── README.md                      # this file
├── rust-toolchain.toml
├── encrypted-ixs/
│   ├── Cargo.toml                 # arcis 0.9.6 + pinned deps
│   └── src/lib.rs                 # ⭐ 5 Arcis circuits — the core MPC logic
├── programs/
│   └── confidential_policy/
│       ├── Cargo.toml             # anchor 0.32.1 + arcium-* 0.9.6
│       └── src/lib.rs             # ⭐ Anchor program: 5 ix + 5 callbacks + 5 init_comp_def
└── client/
    ├── package.json               # @arcium-hq/client + @coral-xyz/anchor 0.32
    ├── tsconfig.json
    └── src/arcium-client.ts       # ⭐ TS wrapper: init / evaluate / commit / reset / update
```

## Circuits (`encrypted-ixs/src/lib.rs`)

| Circuit | Inputs | Outputs |
|---|---|---|
| `init_company_policy` | encrypted PolicyInputs (shared) | encrypted CompanyPolicy (mxe) |
| `evaluate_policy` | encrypted PaymentRequest (shared) + encrypted CompanyPolicy (mxe) | encrypted PolicyDecision (shared) + encrypted CompanyPolicy (mxe, unchanged) |
| `commit_executed_payment` | encrypted u64 projected spend (shared) + encrypted CompanyPolicy (mxe) | encrypted CompanyPolicy (mxe, monthly_spent advanced) |
| `reset_monthly_spend` | encrypted CompanyPolicy (mxe) | encrypted CompanyPolicy (mxe, monthly_spent = 0) |
| `update_policy_limits` | 3× encrypted u64 (shared) + encrypted CompanyPolicy (mxe) | encrypted CompanyPolicy (mxe, limits updated) |

All circuits use the `Enc<Shared, T>` / `Enc<Mxe, T>` distinction from Arcis — only the shared variant can be decrypted client-side. The Mxe variant is opaque to everyone except the MPC cluster.

## Anchor program (`programs/confidential_policy/src/lib.rs`)

| Instruction | Purpose |
|---|---|
| `init_*_comp_def` (×5) | One-time circuit registration at deploy time |
| `init_company_policy` | Create per-company policy PDA with MXE-owned encrypted state |
| `evaluate_policy` | Queue MPC computation, persist encrypted decision on per-payment PDA |
| `commit_executed_payment` | Advance encrypted monthly_spent after main program's transfer succeeds |
| `reset_monthly_spend` | Owner-only: zero monthly_spent at calendar month rollover |
| `update_policy_limits` | Owner-only: replace auto/dual/cap (preserves monthly_spent) |

Each user-facing instruction queues an Arcium computation, then a `#[arcium_callback]` handler persists the encrypted output to a program-owned PDA. The frontend reads the PDA and decrypts client-side using the wallet-derived shared key.

## Client wrapper (`client/src/arcium-client.ts`)

5 high-level async functions matching the Anchor program. Each:
- Derives a deterministic x25519 keypair from the user's Solana wallet (signing a fixed message → SHA256 → x25519 private key). Recoverable from wallet alone, no separate backup.
- Fetches the MXE pubkey, derives shared secret, inits Rescue cipher.
- Encrypts the appropriate plaintext payload.
- Calls `program.methods.X(...).rpc(...)` with all Arcium accounts pre-derived.
- Awaits `awaitComputationFinalization(...)` (typical 5-15s on devnet).
- On `evaluate_policy`, fetches + decrypts the decision PDA and returns `{ requiredApprovals, projectedMonthlySpent }`.

## Status

| Item | Status |
|---|---|
| Arcis circuits — written and ready to compile | ✅ |
| Anchor program — written and ready to compile | ✅ |
| TypeScript client wrapper — written, ready against `@arcium-hq/client` ≥ 0.9.6 | ✅ |
| `arcup` toolchain installed locally | ⏳ user action — see `BUILD_ARCIUM.md` |
| Devnet MXE cluster offset configured | ⏳ user action |
| Program ID generated + `anchor keys sync` | ⏳ user action |
| `arcium build` validates circuits | ⏳ user action |
| `arcium deploy --cluster devnet` succeeds | ⏳ user action |
| Integration test against devnet | ⏳ user action |
| Integration into Black Budget frontend (`app/`) | ⏳ post-deploy |

See repo-root `BUILD_ARCIUM.md` for the bring-online runbook.

## Why this lives outside `programs/black_budget/`

Black Budget's current Anchor program is on **anchor-lang 0.30.1**; Arcium's example integration template uses **anchor-lang 0.32.1**. Upgrading the main program is a separate workstream with its own test re-validation pass. Isolating Phase A in this sub-project lets the privacy story ship without forcing a `0.30 → 0.32` migration first.

After Phase A is verified working on devnet, the main program will be upgraded to 0.32 and the two programs will compose via CPI (Phase B-D in `ARCIUM_INTEGRATION.md`).

## Composition with Black Budget today

The frontend calls both programs sequentially:

```
1. user clicks "Create Payment" with amount=$8400, recipient=Joe, category=Vendor
        ↓
2. frontend: encryptedDecision = await createPaymentConfidential({...})
        ↓ (MPC takes ~5-15s)
3. decision.requiredApprovals = 1, decision.projectedMonthlySpent = ...
        ↓
4. frontend: await blackBudgetProgram.createPayment(... only public fields ...)
        ↓
5. payment PDA now references the decision PDA for downstream approval logic
        ↓
6. on execute_payment success:
        ↓
7. frontend: await commitPaymentSpendConfidential({ projectedMonthlySpent })
```

This adds 1-2 extra wall-clock latency steps (the MPC roundtrips) but provides full privacy on amount + policy without requiring a single rewrite of the existing `black_budget` program.

---

**Spec**: see repo-root `ARCIUM_INTEGRATION.md` for the full architecture and roadmap.
**Bring-online runbook**: see repo-root `BUILD_ARCIUM.md`.
