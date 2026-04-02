# Black Budget

**The private finance operating system for internet-native companies.**

Invoices, payroll, treasury policies, and approvals — executed on Solana with confidential transfers and selective disclosure proofs.

## The Problem

Internet-native companies (crypto startups, DAOs, remote teams) handle payments across borders with contractors, vendors, and team members. Today they choose between:

- **Traditional banks**: Slow, expensive, zero programmability
- **Public crypto**: Fast and cheap, but every payment is visible to competitors, investors, and the public
- **Spreadsheets + manual approval**: Zero enforcement, human error, no audit trail

## The Solution

Black Budget is a **private back-office** that runs on Solana:

1. **Upload an invoice** (PDF/image) → AI extracts vendor, amount, category, risk signals
2. **Treasury policies** evaluate automatically: auto-approve, require 1 approval, require 2, or block
3. **Payment executes** via Token-2022 Confidential Transfers — amounts hidden on-chain
4. **Selective disclosure** lets you prove financial health to investors, show full details to auditors, or provide complete transparency to regulators — each sees only what they need

## Architecture

```
Frontend (Next.js) → Backend (Express + Claude AI) → Solana Program (Anchor + Token-2022)
```

### Solana Program (Anchor)
- Company vault with role-based access (Owner, Approver, Viewer, Contractor)
- On-chain treasury policies: auto-approve limits, dual-approval thresholds, burn caps
- Payment request lifecycle: create → approve → execute
- Token-2022 Confidential Transfers for private settlement

### Backend
- **AI Invoice Parser**: Claude Vision API extracts structured data from any invoice
- **Rule Engine**: Evaluates payments against on-chain treasury policies
- **Proof Generator**: Creates Merkle-tree-based selective disclosure proofs

### Frontend
- Dark-themed dashboard with real-time treasury overview
- Drag-and-drop invoice upload with live AI extraction
- One-click approval flow with risk scoring
- Three-tier proof export (Investor / Auditor / Regulator)

## Quick Start

```bash
# Install dependencies
cd app && pnpm install
cd ../server && pnpm install

# Start backend
cd server && pnpm dev

# Start frontend
cd app && pnpm dev

# Build Solana program
anchor build
anchor deploy --provider.cluster devnet
```

## Treasury Policies (On-Chain)

```
$0 - $5,000     → Auto-approve (instant)
$5,000 - $15,000 → Single approval required
$15,000+         → Dual approval (Founder + CFO)

Monthly burn cap: $75,000
New vendor: Always requires approval
Runway < 8 months: Block discretionary spend
```

## Selective Disclosure

| Audience | Sees | Doesn't See |
|----------|------|-------------|
| **Investor** | Burn rate, runway, category % | Individual payments, vendor names |
| **Auditor** | All amounts, categories, dates | Real vendor identities (pseudonymized) |
| **Regulator** | Everything | — (requires 2/2 multisig) |

All three views share the same Merkle root — proving they come from the same dataset.

## Tech Stack

- **Solana Program**: Anchor 0.30, Token-2022 (Confidential Transfers)
- **Backend**: Express, TypeScript, Claude API (Vision)
- **Frontend**: Next.js 15, TailwindCSS, Solana Wallet Adapter
- **Privacy**: Token-2022 Confidential Balances + Merkle proof selective disclosure

## Team

Built for the [Solana Frontier Hackathon](https://colosseum.com/frontier) (April 2026).

## License

MIT
