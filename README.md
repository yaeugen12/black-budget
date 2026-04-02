# Black Budget

**The private finance operating system for internet-native companies.**

Invoices, payroll, treasury policies, and approvals — executed on Solana with confidential transfers and selective disclosure proofs.

> Built for the [Solana Frontier Hackathon](https://colosseum.com/frontier) (April 2026)

---

## Run the Full Demo in 5 Minutes

**Prerequisites:** Node.js 20+, pnpm, a Phantom wallet (set to Devnet)

```bash
# 1. Clone and install
git clone https://github.com/yaeugen12/black-budget.git
cd black-budget/app && pnpm install

# 2. Set your Anthropic API key (optional — mock fallback works without it)
echo "ANTHROPIC_API_KEY=your-key-here" > .env.local

# 3. Start the app
pnpm dev
# Open http://localhost:3000

# 4. In your browser:
#    - Connect Phantom wallet (Devnet)
#    - Click "Create Company" → sign the transaction
#    - Go to Policies → set thresholds → Save (on-chain TX)
#    - Go to Invoices → upload tests/test-invoice.png → watch AI parse it
#    - Go to Proofs → click Investor / Auditor / Regulator views
```

**Run the tests:**
```bash
pnpm test                              # 48 unit + integration tests (offline)
node tests/record-proof-test.mjs       # 6 proof-specific on-chain tests
node tests/full-flow-test.mjs          # 5-step payment flow on-chain test
```

---

## The Problem

Internet-native companies handle payments across borders with contractors, vendors, and team members. Today they choose between:

- **Traditional banks**: Slow, expensive, zero programmability
- **Public crypto**: Fast and cheap, but every payment is visible to competitors and the public
- **Spreadsheets + manual approval**: Zero enforcement, human error, no audit trail

## The Solution

Black Budget is a **private back-office** that runs on Solana:

1. **Upload an invoice** (PDF/image) — AI extracts vendor, amount, category, risk signals
2. **Treasury policies** evaluate automatically: auto-approve, require 1 approval, require 2, or block
3. **Payment executes** via Token-2022 — amounts hidden on-chain
4. **Selective disclosure** proves financial health to investors, shows details to auditors, or provides full transparency to regulators — each sees only what they need

---

## Architecture

```
                    ┌──────────────────────────────┐
                    │     Frontend (Next.js 16)     │
                    │  Dashboard │ Invoices │ Proofs │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │  API Route: /api/parse-invoice │
                    │  Claude Vision → structured    │
                    │  data → policy evaluation      │
                    └──────────────┬───────────────┘
                                   │
              ┌────────────────────▼────────────────────┐
              │          Solana Program (Anchor)         │
              │                                         │
              │  Company PDA ─── Vault (Token-2022 USDC) │
              │       │                                  │
              │  Member PDAs ─── Role-based access       │
              │       │                                  │
              │  Payment PDAs ── Policy enforcement      │
              └─────────────────────────────────────────┘
```

---

## What's Real vs. What's Demo

This is critical for understanding the project's maturity:

### On-Chain (Real, deployed to Solana Devnet)

| Feature | Status | Proof |
|---------|--------|-------|
| Company creation (PDA + vault) | **Live** | `3xgDaa...pERpg9k` on devnet |
| Role-based members (Owner/Approver/Viewer/Contractor) | **Live** | Member PDAs created on-chain |
| Treasury policies (auto-approve, dual-approve, burn cap) | **Live** | Stored in Company PDA, enforced per payment |
| Payment lifecycle (create → approve → execute) | **Live** | USDC transfers from vault to recipient |
| Token-2022 USDC vault | **Live** | Vault holds real Token-2022 tokens |
| Confidential Transfer extension | **Live** | Mint `Fc4uFQ...meF` has CT extension enabled (auto-approve policy) |

> **Note on Confidential Transfers:** The USDC mint has the Confidential Transfer extension activated. However, Solana's ZK ElGamal Proof program is currently disabled on devnet, so actual confidential transfers (encrypted amounts) cannot execute yet. The extension is ready — when Solana re-enables ZK proofs, amounts will be hidden on-chain automatically. Standard transfers work normally in the meantime.

### Off-Chain (Real, running in the backend)

| Feature | Status | Detail |
|---------|--------|--------|
| AI invoice parsing | **Live** | Claude Vision API extracts vendor, amount, line items, risk flags |
| Policy evaluation engine | **Live** | Rules engine evaluates every invoice against on-chain policies |
| Selective disclosure proofs | **Live** | Real Merkle tree from on-chain payments, 3-tier views with pseudonymization |
| Vault balance on dashboard | **Live** | Reads actual Token-2022 balance via RPC |
| Multi-user approval flow | **Live** | Tested with 2 wallets: Owner creates, CFO approves |
| Proof on-chain anchoring | **Live** | `record_proof` (3 tiers) + `record_compliance_proof` (parametric queries) |
| Programmable compliance proofs | **Live** | Prove "runway > 6mo" or "no vendor > 40%" without revealing data |
| Payroll batch execution | **Live** | Sequential batch with live progress, TX log with Explorer links |
| Monthly spend reset | **Live** | Lazy reset in Solana program — resets when month changes, emits event |

### Remaining Abstractions

| Feature | Current State | Production Path |
|---------|--------------|-----------------|
| Confidential transfer amounts | Token-2022 CT extension enabled on mint; actual transfers use standard `transfer_checked` | Solana's ZK ElGamal Proof program is currently disabled on devnet. When re-enabled, encrypted transfers work with zero code changes |
| Proof on-chain anchoring | **Live** — `record_proof` and `record_compliance_proof` instructions, wired to UI with Anchor button | — |
| Invoice file storage | localStorage + Supabase (optional) | S3/R2 for PDFs, Supabase for metadata |

---

## Treasury Policies (On-Chain)

Policies are stored in the Company PDA and enforced by the Solana program on every payment:

```
$0 - $5,000      → Auto-approve (instant, zero signatures needed)
$5,000 - $15,000  → Single approval required
$15,000+          → Dual approval (Founder + CFO)

Monthly burn cap:  $75,000 (blocks payments that would exceed)
New vendor:        Always requires manual approval
Runway < 8 months: Blocks discretionary spend categories
```

## Selective Disclosure

| Audience | Sees | Hidden |
|----------|------|--------|
| **Investor** | Burn rate, runway, category breakdown | Individual payments, vendor names, wallet addresses |
| **Auditor** | All amounts, categories, dates, payment IDs | Real vendor names (pseudonymized as Vendor-A7F3) |
| **Regulator** | Everything (requires 2/2 Owner multisig) | Nothing |

All three views share the same Merkle root — cryptographic proof they come from the same dataset.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Solana Program** | Anchor (Rust) | 0.30.1 |
| **Token Standard** | Token-2022 (SPL) | — |
| **Frontend** | Next.js + TailwindCSS | 16.2 |
| **AI** | Claude API (Vision) | Sonnet 3.5 / 4.5 |
| **Wallet** | Solana Wallet Adapter | 0.15 |
| **Client** | @coral-xyz/anchor + @solana/web3.js | 0.30.1 / 1.98.4 |
| **Tests** | Vitest | 4.1 |
| **Language** | TypeScript + Rust | 5.x / 1.94 |

## Project Structure

```
black-budget/
├── programs/black_budget/     # Solana program (Anchor/Rust) — 1,300+ lines
│   └── src/
│       ├── instructions/      # 10 instructions: payments, proofs, compliance, policies, members
│       └── state/             # Company, Member, PaymentRequest, ProofRecord, ComplianceProof
├── app/                       # Next.js frontend
│   └── src/
│       ├── app/               # 10 pages + API route (incl. compliance proofs)
│       ├── components/        # Sidebar, Onboarding, AppShell
│       └── lib/               # IDL, CompanyContext, Merkle, Compliance engine
├── server/                    # Express backend
│   └── src/services/          # invoice-parser, rule-engine, proof-generator
└── tests/                     # E2E on-chain tests (proof + payment flow)
```

## Tests

**54 tests total across 7 layers:**

| Layer | Tests | What it covers |
|-------|-------|---------------|
| Rule Engine | 16 | Policy decisions: thresholds, burn cap, vendor verification, edge cases |
| PDA Derivation | 15 | Company, vault, member, payment, proof PDAs — determinism + isolation |
| IDL Integrity | 11 | 10 instructions, 5 account types, discriminator correctness (SHA-256) |
| Merkle | 3 | Tree construction, pseudonymization, hash abbreviation |
| API Integration | 3 | AI parsing end-to-end, error handling, policy response |
| On-Chain Proofs | 6 | 3 proof types, data verification, duplicate rejection, contractor rejection |
| On-Chain Flow | 5 | Create company → set policies → create payment → execute → verify |

## Deployed Addresses (Devnet)

| What | Address |
|------|---------|
| Program | `3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k` |
| USDC Mint (Token-2022 + CT) | `Fc4uFQAaT38mwx6ELhp8GXHsuRBsyYPuW3Ltcn4y7meF` |
| Deploy Authority | `HGVzMKLxYYKFoy8XpGbCJjFYa739KndS8FYrnLnR9Es` |

## License

MIT
