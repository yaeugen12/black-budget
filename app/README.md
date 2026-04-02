# Black Budget — Frontend

Next.js 16 application powering the Black Budget dashboard.

## Setup

```bash
pnpm install
cp .env.local.example .env.local   # Add your ANTHROPIC_API_KEY
pnpm dev                            # http://localhost:3000
```

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — treasury balance, spend, runway, recent activity |
| `/invoices` | Upload invoice (PDF/PNG) — AI extracts data, policy evaluates |
| `/approvals` | Pending payments — approve or reject with one click |
| `/payments` | Payment history with status and on-chain TX links |
| `/team` | Member management — Owner, Approver, Viewer, Contractor roles |
| `/policies` | Treasury rules — auto-approve limit, dual threshold, burn cap |
| `/proofs` | Selective disclosure — Investor, Auditor, Regulator views |

## Key Files

```
src/
  app/
    api/parse-invoice/    # Claude Vision API route (server-side)
    page.tsx              # Dashboard (reads on-chain state)
    invoices/page.tsx     # AI invoice parsing + policy evaluation
    proofs/page.tsx       # Selective disclosure proof export
  components/
    onboarding.tsx        # Connect wallet + create company flow
    sidebar.tsx           # Navigation with live pending count
    app-shell.tsx         # Routes between onboarding and main app
  lib/
    company-context.tsx   # On-chain state manager (all Anchor calls)
    idl.ts                # Anchor IDL with discriminators
    program.ts            # useBlackBudget hook (PDA helpers)
```

## Tests

```bash
pnpm test              # 41 unit + integration tests
node full-flow-test.mjs # 5-step on-chain flow (requires devnet)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For real AI parsing | Claude API key for invoice extraction |

Without the key, invoice parsing falls back to mock data.
