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
pnpm test                  # 41 unit + integration tests (offline)
node full-flow-test.mjs    # 5-step on-chain smoke test (needs devnet)
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

### Off-Chain (Real, running in the backend)

| Feature | Status | Detail |
|---------|--------|--------|
| AI invoice parsing | **Live** | Claude Vision API extracts vendor, amount, line items, risk flags |
| Policy evaluation engine | **Live** | Rules engine evaluates every invoice against on-chain policies |
| Selective disclosure proofs | **Functional** | Merkle tree generation + 3-tier views (Investor/Auditor/Regulator) |

### Demo Abstractions (Simulated for hackathon scope)

| Feature | Current State | Production Path |
|---------|--------------|-----------------|
| Confidential transfer amounts | Token-2022 vault exists; transfers use standard `transfer_checked` | Enable Token-2022 Confidential Balances extension (ElGamal encryption) |
| Vault balance on dashboard | Hardcoded $284,750 minus on-chain `total_spent` | Read actual vault token balance via RPC |
| Proof on-chain anchoring | Merkle root generated client-side | Add `ProofRecord` PDA with on-chain merkle root + timestamp |
| Multi-user approval flow | Single wallet creates + approves | Multiple Phantom wallets signing separate approval TXs |
| Payroll batch execution | UI shows batch concept | Loop `create_payment` + `execute_payment` for each recipient |

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
├── programs/black_budget/     # Solana program (Anchor/Rust) — 916 lines
│   └── src/
│       ├── instructions/      # init_company, payments, policies, members
│       └── state/             # Company, Member, PaymentRequest, ProofRecord
├── app/                       # Next.js frontend — 1,658 lines
│   └── src/
│       ├── app/               # 7 pages + API route
│       ├── components/        # Sidebar, Onboarding, AppShell
│       └── lib/               # IDL, Anchor hooks, CompanyContext
├── server/                    # Express backend — 445 lines
│   └── src/services/          # invoice-parser, rule-engine, proof-generator
└── tests/                     # Full-flow on-chain test
```

## Tests

**46 tests total across 5 layers:**

| Layer | Tests | What it covers |
|-------|-------|---------------|
| Rule Engine | 16 | Policy decisions: thresholds, burn cap, vendor verification, edge cases |
| PDA Derivation | 11 | Deterministic addresses, cross-company isolation, nonce uniqueness |
| IDL Integrity | 10 | Discriminator correctness (SHA-256), type resolution, completeness |
| API Integration | 4 | AI parsing end-to-end, error handling, policy response |
| On-Chain Flow | 5 | Create company → set policies → create payment → execute → verify |

## Deployed Addresses (Devnet)

| What | Address |
|------|---------|
| Program | `3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k` |
| Token-2022 USDC Mint | `Ac6Q53KEURMNhngkR1yvhrsxd6vhU1pNR31TMykjVFp` |
| Deploy Authority | `HGVzMKLxYYKFoy8XpGbCJjFYa739KndS8FYrnLnR9Es` |

## License

MIT
