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

# 2. Set your Anthropic API key (for AI invoice parsing)
echo "ANTHROPIC_API_KEY=your-key-here" > .env.local

# 3. Optional: Supabase (for persistent storage)
echo "NEXT_PUBLIC_SUPABASE_URL=your-url" >> .env.local
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key" >> .env.local

# 4. Start the app
pnpm dev
# Open http://localhost:3000
```

**Demo walkthrough** (built into the dashboard):
1. Connect Phantom wallet (Devnet) → Create Company → sign TX
2. Set Policies → auto-approve $5K, dual $15K, burn cap $75K
3. Upload Invoice → AI parses → enter recipient wallet → create on-chain payment
4. Approve & Execute → USDC transfers from vault
5. Generate Proofs → anchor on-chain → export verifiable JSON

**Run the tests:**
```bash
pnpm test                                            # 48 unit + integration tests
ANTHROPIC_API_KEY=... node tests/invoice-policy-test.mjs  # 10 invoice AI parsing tests
node tests/record-proof-test.mjs                     # 6 proof on-chain tests
node tests/full-flow-test.mjs                        # 5-step payment flow test
ANTHROPIC_API_KEY=... node tests/full-user-simulation.mjs # 14-step full user simulation
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
3. **Payment executes** via Token-2022 USDC — real on-chain transfer from vault to recipient
4. **Selective disclosure** proves financial health to investors, shows pseudonymized details to auditors, or provides full transparency to regulators — all from the same Merkle root, verifiable on-chain

---

## Architecture

```
                    ┌──────────────────────────────────────────┐
                    │         Frontend (Next.js 16)            │
                    │  Dashboard │ Invoices │ Proofs │ Verify  │
                    └──────────────────┬───────────────────────┘
                                       │
                    ┌──────────────────▼───────────────────────┐
                    │     API Route: /api/parse-invoice         │
                    │     Claude Vision → structured data       │
                    │     → policy evaluation                   │
                    └──────────────────┬───────────────────────┘
                                       │
              ┌────────────────────────▼──────────────────────────┐
              │            Solana Program (Anchor)                 │
              │                                                    │
              │  Company PDA ─── Vault (Token-2022 USDC)           │
              │       │                                            │
              │  Member PDAs ─── Role-based access (4 roles)       │
              │       │                                            │
              │  Payment PDAs ── Policy enforcement on-chain       │
              │       │                                            │
              │  ProofRecord PDAs ── Anchored Merkle roots         │
              │       │                                            │
              │  ComplianceProof PDAs ── Parametric query results  │
              └────────────────────────────────────────────────────┘
                                       │
              ┌────────────────────────▼──────────────────────────┐
              │                  Supabase                          │
              │  invoices │ vendors │ proof_records                │
              └───────────────────────────────────────────────────┘
```

---

## Selective Disclosure & Verifiable Proofs

The core innovation: three disclosure levels, one Merkle root, verifiable on-chain.

| Audience | Sees | Hidden |
|----------|------|--------|
| **Investor** | Burn rate, runway, category split, team size | Individual payments, vendor names, wallet addresses |
| **Auditor** | All amounts, categories, dates, payment IDs | Real vendor names (pseudonymized as Addr-A7F3) |
| **Regulator** | Everything — full disclosure | Nothing |

### How It Works

1. **Merkle tree** built client-side from on-chain payment data: `SHA-256(paymentId:recipient:amount:category:timestamp)`
2. **Same root** regardless of disclosure level — proves all views come from the same dataset
3. **Anchored on-chain** via `record_proof` instruction → creates a `ProofRecord` PDA with the Merkle root, proof type, and timestamp
4. **Verifiable export** (v2.0 JSON) includes root, on-chain TX, and step-by-step verification instructions
5. **Verification page** (`/proofs/verify`) — anyone can upload a proof JSON and independently verify integrity + on-chain anchor

### Example Proof Export

```json
{
  "version": "2.0",
  "type": "investor",
  "merkleRoot": "0x8cde79c233dfdc57d22a1f922b0fc2ff09089368af58507590d0e662f37995f9",
  "leafCount": 11,
  "company": { "name": "raiydium", "address": "CyEoDZa...WZqvXAGMJcffM5" },
  "onChainAnchor": {
    "tx": "65ajst8KXvn2QZMEGvMCGdeUwUtaKDfHk3BGhvF5M3iL...",
    "explorer": "https://explorer.solana.com/tx/65ajst8K...?cluster=devnet"
  },
  "verification": {
    "instructions": "Reconstruct leaf hashes → build Merkle tree → compare root → fetch on-chain PDA",
    "leafFormat": "SHA-256(paymentId:recipient:amount:category:timestamp)",
    "algorithm": "binary merkle tree, duplicate last leaf if odd count"
  },
  "data": {
    "vaultBalance": 968000,
    "totalSpent": 32000,
    "runway": 30.3,
    "categoryBreakdown": { "vendor": "41%", "contractor": "59%" },
    "redacted": ["individual_payments", "vendor_names", "payment_amounts", "wallet_addresses"]
  }
}
```

### Programmable Compliance Proofs

Beyond selective disclosure, Black Budget supports **parametric compliance queries**:

- "Is runway > 6 months?" → YES/NO, anchored on-chain with constraint hash
- "Is admin spend < 30% of total?" → verifiable without revealing individual amounts
- "No single vendor received > 50% of total spend?" → vendor concentration check

Built-in templates: Investor Health Check, Burn Rate Discipline, Regulatory Threshold, Vendor Diversification. Custom queries supported via the query builder.

---

## Treasury Policies (On-Chain)

Policies are stored in the Company PDA and **enforced by the Solana program** at both payment creation and execution:

```
$0 - $5,000      → Auto-approve (instant, zero signatures needed)
$5,000 - $15,000  → Single approval required
$15,000+          → Dual approval (Founder + CFO)

Monthly burn cap:  $75,000 (enforced at create AND execute — no batch bypass)
Self-payments:     Blocked (requester ≠ recipient)
Self-approval:     Blocked (approver ≠ requester)
```

### Security Hardening

The program has been through 3 rounds of security auditing:

- **Monthly burn cap** enforced at execution (not just creation) — prevents batch bypass
- **Self-payment** blocked: `requester ≠ recipient`
- **Self-approval** blocked: `approver ≠ requester`
- **Separate `can_execute` permission** on Role (distinct from `can_approve`)
- **Vault balance pre-check** before CPI transfer
- **Period validation** on proofs: `period_start < period_end`
- **Member deactivation guard** prevents underflow
- **Proof PDA** includes `proof_type` byte — investor/auditor/regulator can coexist for same period
- **Events emitted** on all governance actions (PoliciesUpdated, MemberAdded, MemberRemoved)

---

## What's Real vs. What's Demo

### On-Chain (Real, deployed to Solana Devnet)

| Feature | Status | Detail |
|---------|--------|--------|
| Company creation (PDA + vault) | **Live** | Token-2022 USDC vault auto-created |
| Role-based members (4 roles) | **Live** | Owner, Approver, Viewer, Contractor |
| Treasury policies | **Live** | Auto-approve, dual-approve, monthly cap — enforced per payment |
| Payment lifecycle | **Live** | create → approve → execute (real USDC transfer) |
| Proof anchoring | **Live** | `record_proof` (3 tiers) + `record_compliance_proof` |
| Compliance proofs | **Live** | Parametric queries anchored on-chain |
| Security guards | **Live** | Self-pay/self-approve blocked, vault pre-check, burn cap at execute |

### Off-Chain (Real)

| Feature | Status | Detail |
|---------|--------|--------|
| AI invoice parsing | **Live** | Claude Vision extracts vendor, amount, line items, risk flags |
| Selective disclosure | **Live** | Real Merkle tree, 3-tier views, pseudonymization |
| Proof verification | **Live** | `/proofs/verify` — upload JSON, verify against on-chain anchor |
| Supabase persistence | **Live** | Invoices, vendors, proof records |
| Demo walkthrough | **Live** | Interactive checklist on dashboard with live on-chain state |

### Remaining Abstractions

| Feature | Current State | Production Path |
|---------|--------------|-----------------|
| Confidential transfers | CT extension enabled on mint; transfers use standard `transfer_checked` | Solana's ZK ElGamal Proof program is temporarily disabled on devnet — when re-enabled, encrypted transfers work with zero code changes |
| Invoice file storage | Supabase + localStorage | S3/R2 for PDFs |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Solana Program** | Anchor 0.30.1 (Rust) — 1,300+ lines, 10 instructions |
| **Token Standard** | Token-2022 (SPL) with Confidential Transfer extension |
| **Frontend** | Next.js 16 + TailwindCSS — 11 pages |
| **AI** | Claude API (Vision) for invoice parsing |
| **Database** | Supabase (PostgreSQL) |
| **Wallet** | Solana Wallet Adapter (Phantom) |
| **Client** | @coral-xyz/anchor + @solana/web3.js |
| **Tests** | Vitest + custom E2E on-chain tests |

## Project Structure

```
black-budget/
├── programs/black_budget/     # Solana program (Anchor/Rust) — 1,300+ lines
│   └── src/
│       ├── instructions/      # 10 instructions: payments, proofs, compliance, policies, members
│       └── state/             # Company, Member, PaymentRequest, ProofRecord, ComplianceProof
├── app/                       # Next.js frontend — 11 pages
│   └── src/
│       ├── app/               # Dashboard, Invoices, Payments, Approvals, Team,
│       │                      # Payroll, Policies, Proofs, Compliance, Verify, Landing
│       ├── components/        # Sidebar, Onboarding, AppShell, ConfidentialBadge
│       └── lib/               # IDL, CompanyContext, Merkle, Compliance engine
├── server/                    # Express backend (rule engine, proof generator)
├── supabase/                  # Database schema
└── tests/                     # 69+ tests across 4 test suites
    ├── full-user-simulation.mjs   # 14-step user journey (pages + AI + on-chain + Supabase)
    ├── invoice-policy-test.mjs    # 10 invoice types × AI parsing × policy routing
    ├── record-proof-test.mjs      # 6 proof anchoring tests
    ├── full-flow-test.mjs         # 5-step payment flow
    └── invoices/                  # 10 generated test invoices (PNG)
```

## Tests

**69+ tests across 4 suites:**

| Suite | Tests | What it covers |
|-------|-------|---------------|
| **Vitest** (unit + integration) | 48 | Rule engine (16), PDA derivation (15), IDL integrity (11), Merkle (3), API (3) |
| **Full User Simulation** | 14 | Pages load, AI parse, create/execute payment, Merkle proof, anchor on-chain, compliance proof, Supabase — with full Explorer TX links |
| **Invoice Policy Test** | 10 | 10 invoice types covering all policy paths ($450→$65K, auto/single/dual/new vendor) |
| **On-Chain Tests** | 11 | Payment flow (5) + proof anchoring (6) with role/permission checks |

## Deployed Addresses (Devnet)

| What | Address |
|------|---------|
| Program | `3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k` |
| Company ("raiydium") | `CyEoDZa4KMZqijRbwmj9cAMfxCfa73WZqvXAGMJcffM5` |
| Vault (USDC) | `HD5k6KzmTULpZVU3vKiyDLRuStZDXq61mhgoYdkQGNBy` |
| USDC Mint (Token-2022) | `Ac6Q53KEURMNhngkR1yvhrsxd6vhU1pNR31TMykjVFp` |
| CT-Enabled Mint | `Fc4uFQAaT38mwx6ELhp8GXHsuRBsyYPuW3Ltcn4y7meF` |

## License

MIT
