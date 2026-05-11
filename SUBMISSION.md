# Black Budget — Colosseum Solana Frontier Submission Kit

Everything needed for hackathon submission. All copy is ready to paste; all assets exist in the repo.

---

## Table of Contents
1. [One-liner & taglines](#1-one-liner--taglines)
2. [Hackathon submission form copy](#2-hackathon-submission-form-copy)
3. [Pitch deck — slide-by-slide](#3-pitch-deck--slide-by-slide)
4. [Demo video script (4 min)](#4-demo-video-script-4-min)
5. [Competitive landscape](#5-competitive-landscape)
6. [X / Twitter thread](#6-x--twitter-thread)
7. [Pre-submission checklist](#7-pre-submission-checklist)

---

## 1. One-liner & taglines

**Primary one-liner** (use everywhere):
> Black Budget is the private finance operating system for internet-native companies — invoices, payroll, and treasury policies on Solana with selective disclosure proofs.

**Short pitches** (for X bio, hackathon header, Devpost):
- "Private treasury on Solana. Compliance without exposure."
- "Private treasury, verifiably compliant."
- "Crypto treasury that doesn't leak your burn rate."
- "Token-2022 treasury OS with selective disclosure."

**Tweet-size (200 chars)**:
> Today's crypto treasury choice: leak everything to competitors or use spreadsheets. Black Budget runs your invoices, payroll, and approvals on Solana — and proves compliance without revealing amounts.

---

## 2. Hackathon submission form copy

### Project name
Black Budget

### Tagline
Private treasury OS for internet-native companies on Solana.

### Description (250 words — paste into "What it does")
Internet-native companies pay contractors in 30+ countries every month. Today they pick between three bad options: traditional banks (slow, no programmability), public blockchains (every payment leaks vendor + amount + cadence to competitors and indexers), or spreadsheets (no enforcement, no audit trail, human error).

Black Budget is a private treasury operating system on Solana. Companies upload invoices (PDF/image), Claude Vision extracts structured data, treasury policies evaluate automatically on-chain (auto-approve, dual-approve, monthly burn cap), and payments execute via Token-2022 USDC with confidential transfer extension enabled. The Solana program is 1,500 lines of Anchor, deployed to devnet, with 69+ tests across unit / integration / on-chain suites and 4 audit passes (0 Critical/High open).

The core innovation is **three-tier privacy**:
- **Tier 1 — Selective disclosure (live today)**: same Merkle root, three views — investor sees runway + burn rate, auditor sees pseudonymized amounts, regulator sees everything. All anchored on-chain.
- **Tier 2 — Confidential SPL (Q3 2026)**: on-chain amounts go encrypted via Arcium's Confidential SPL token standard.
- **Tier 3 — Encrypted compute (Q4 2026)**: policy evaluation, compliance proofs, and Merkle generation execute inside Arcium MXEs (MPC clusters). Plaintext payment data never leaves trusted enclaves.

Compliance proofs answer parametric queries ("is runway > 6 months?", "is admin spend < 30%?") without revealing underlying data. Each proof is anchored on-chain with constraint hash for independent verification.

Built in 6 weeks. Live end-to-end demo on devnet. Full integration spec for Arcium roadmap in repo (`ARCIUM_INTEGRATION.md` — 12-week implementation milestones).

### Tech stack
Solana program (Anchor 0.30.1, Rust), Token-2022 with Confidential Transfer extension, Next.js 16, Claude Vision API, Supabase (PostgreSQL), Solana Wallet Adapter, @coral-xyz/anchor.

### Links
- **GitHub**: https://github.com/yaeugen12/black-budget
- **Live demo**: https://black-budget.vercel.app *(deploy before submission)*
- **Video demo**: *(record + insert URL)*
- **Program (devnet)**: `3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k`
- **Example company**: `CyEoDZa4KMZqijRbwmj9cAMfxCfa73WZqvXAGMJcffM5`

### Track
Consumer / DeFi / Infrastructure → **pick one based on Colosseum's actual track list at submission time**. Recommended: **DeFi** (treasury management = financial primitive) with strong secondary fit for **Consumer** (B2B SaaS UX).

---

## 3. Pitch deck — slide-by-slide

> Build in Pitch, Figma, or Google Slides. 16:9. Dark theme (#0A0A0A bg, #FAFAFA text, white redaction blocks). One idea per slide. **13 slides total.**

### Slide 1 — Title
- **BLACK BUDGET** logo (large)
- One-liner: "Private treasury on Solana."
- Subline: "Built for Colosseum Solana Frontier Hackathon · 2026"
- Bottom: github.com/yaeugen12/black-budget

### Slide 2 — The painful moment
- Big screenshot: a real Solana transaction on solscan.io showing recipient + amount publicly
- Headline: "Your competitor knows exactly what you pay your top engineers."
- Bullet: 35+ million Solana wallets · 0 of them want their payroll public.

### Slide 3 — Why current options fail
Three-column table:

| Traditional banks | Public crypto | Spreadsheets |
|-------------------|---------------|--------------|
| Slow (3–5 days) | Instant + cheap | Instant |
| Zero programmability | **Publicly visible** | Zero enforcement |
| 1-3% per cross-border tx | < $0.01 | Human error |
| Compliance via auditor | DIY compliance | None |

Bottom: "Pick two out of three. Or pick all four — with Black Budget."

### Slide 4 — Black Budget in 4 steps
Flow diagram, left to right:
1. **Upload invoice** (PDF/image)
2. **AI parses** → vendor, amount, category, risk
3. **Policy evaluates** → auto-approve / 1-sig / 2-sig / block (on-chain)
4. **Execute** → Token-2022 USDC transfer from vault

### Slide 5 — The big insight: selective disclosure
- Three labelled views of the SAME Merkle root:
  - **Investor**: "Runway 18mo · Burn $42k/mo · 12 contractors" (no addresses, no amounts)
  - **Auditor**: "Payment to Vendor-A7F3 · $8,400 · 2026-04-15" (pseudonymized)
  - **Regulator**: Full transaction list
- Bottom: "Same root. Verifiable on-chain. No re-encryption."

### Slide 6 — Programmable compliance proofs
- Show a constraint proof JSON snippet:
  ```
  Query: "Is admin spend < 30% of total?"
  Result: YES
  Constraint hash: 0x4f...
  On-chain anchor: solscan.io/tx/65ajst8K...
  ```
- "Prove financial discipline without revealing financial data."

### Slide 7 — Architecture
The diagram from README. Frontend → API (Claude Vision) → Solana program → Token-2022 vault → ProofRecord PDAs.

### Slide 8 — Real, not vapor
- Live on Devnet ✓
- 10 instructions, 1,500 LOC Anchor ✓
- 69+ tests across 4 suites ✓
- **4 audit passes, 0 Critical / 0 High open findings**
- 5 example invoices live (with Explorer TX links)

### Slide 9 — Differentiation
Two-column compare table — see Section 5 below.

### Slide 10 — Market & GTM
- **ICP**: Solana-native startups, dev shops with USDC payroll, crypto funds, DAOs that need quarterly reporting to LPs
- **Why now**: Token-2022 mainnet maturity in 2026, ZK ElGamal program returning to mainnet, USDC dominance on Solana
- **Top of funnel**: Solana ecosystem newsletters, Superteam DAOs, Colosseum cohort, Founder Twitter
- **First 10 customers**: hand-onboard. Free for hackathon-period users.

### Slide 11 — Privacy Roadmap (the 3-tier story)
Show the three tiers as a stack with `Live` / `Q3 2026` / `Q4 2026` badges:

- **Tier 1 — Application (Live today)**: Selective disclosure. Investor / auditor / regulator views from one Merkle root. Anchored on-chain.
- **Tier 2 — Protocol (Q3 2026, Arcium CSPL)**: Confidential SPL token replaces Token-2022 USDC. **Encrypted on-chain balances + transfers**. No bridge, no L2 — native Solana.
- **Tier 3 — Compute (Q4 2026, Arcium MXE)**: Policy evaluation, compliance constraints, Merkle generation **all execute on encrypted state inside MPC**. Plaintext never leaves trusted clusters.

Bottom line: "Same Solana program. Three composable privacy upgrades. Each shipped independently. Detailed spec in repo → `ARCIUM_INTEGRATION.md` (50 pages, 12 implementation milestones)."

### Slide 12 — Wider Roadmap
- **Q3 2026**: Mainnet launch + Tier 2 (Confidential SPL via Arcium)
- **Q4 2026**: Tier 3 (encrypted policy + compliance in Arcium MXE) + Squads multisig integration (use Squads vaults as Black Budget company authority)
- **Q1 2027**: Multi-asset support (SOL, SOL-LSTs, USDT-CSPL), runway-based discretionary spend gates, Light Protocol stealth addresses
- **2027**: Off-chain payroll partners (Deel-style fiat off-ramp from vault), tax export, ERP integrations (Quickbooks/Xero)

### Slide 13 — Team & ask
- Team: your details
- Ask: $X seed for 12-month runway to mainnet launch + first 50 customers
- Or: looking for design partner (Solana-native startup with $100k+ monthly burn)

---

## 4. Demo video script (4 min)

> Tool: Loom / OBS / Riverside · resolution 1080p · screen recording + facecam optional · subtitles required for accessibility · upload unlisted to YouTube, embed link in README + submission form.

### Cold open (0:00-0:15)
*[Screen: solscan.io showing a real payment to a recognizable wallet]*

> "This is a payment a real Solana company made last week. Anyone with this address can see the amount, the recipient, when it happened, and how often it happens. Their competitors can see it. Their employees can see what their coworkers earn. The whole point of running a company on Solana is supposed to be fast and cheap — but at the cost of telegraphing every move to the market."

### Problem framing (0:15-0:45)
*[Screen: a 3-column slide — Banks vs Public Crypto vs Spreadsheets]*

> "Today, an internet-native company picks one of three bad options. Banks are slow and dumb. Crypto is fast but public. Spreadsheets are private but unverifiable. None of these win. Black Budget is the fourth option — fast, cheap, private AND verifiable."

### Solution intro (0:45-1:00)
*[Screen: Black Budget landing page or dashboard]*

> "Black Budget is a treasury operating system that runs entirely on Solana. Upload an invoice, AI extracts the structured data, treasury policies evaluate on-chain automatically, and payment executes via Token-2022 USDC. Let me show you the full flow on Devnet — real money, real on-chain transfer, in under a minute."

### Live demo: invoice → payment (1:00-2:30)
*[Screen: dashboard → invoice upload]*

> "I have a real PDF invoice — $8,400 from a vendor we work with. I upload it..."

*[Screen: Claude parses, fields populate]*

> "...Claude Vision extracts vendor, amount, category, line items in real time. We get a structured invoice. Now I enter the recipient wallet."

*[Screen: policies page brief flash]*

> "Our policies say payments under $5K auto-approve, $5K-$15K need one approval, $15K+ need two. This one's $8,400 so it needs a single approver."

*[Screen: payments page, click Approve as second wallet]*

> "I switch to my CFO wallet and approve. Status flips to Approved. Now I execute."

*[Screen: execute payment, Phantom modal pops up]*

> "Sign with Phantom..."

*[Screen: Solana Explorer TX link clicked, shows confirmation]*

> "...and there it is. Real USDC transfer from our company vault to the vendor. On-chain. Token-2022. Sub-second."

### The wow: selective disclosure (2:30-3:15)
*[Screen: Proofs page]*

> "Here's where it gets interesting. I want to send my financial state to three different audiences without revealing the same things to each. Watch."

*[Click "Generate Investor Proof"]*

> "Investor view: they see my runway is 18 months, burn rate is $42K a month, and how I split between vendors and contractors. They DON'T see any specific payment, any wallet, or any vendor name."

*[Click "Generate Auditor Proof"]*

> "Auditor view: they see every transaction amount and category, but vendor names are pseudonymized as Addr-A7F3 etc. Different audience, different visibility — same Merkle root."

*[Click "Anchor on-chain"]*

> "I anchor the Merkle root to a Solana PDA. Anyone can independently verify my proof against this on-chain anchor. The constraint hash proves what query was answered."

*[Click "Verify"]*

> "And here's the verification page — anyone with the proof JSON can upload it and confirm the Merkle root matches on-chain. Trust-minimized financial reporting."

### Technical depth (3:15-3:45)
*[Screen: GitHub repo / file structure]*

> "Under the hood: 1,500 lines of Anchor, 10 on-chain instructions, Token-2022 with Confidential Transfer extension enabled on the mint. The selective disclosure runs client-side as a binary Merkle tree, anchored via a record_proof instruction with proof_type byte so investor / auditor / regulator proofs coexist."

*[Screen: AUDIT_FINDINGS_RESOLVED.md]*

> "Four audit passes, all Criticals and Highs closed — the report is in the repo. 69 tests including a 14-step end-to-end user simulation."

### Closing (3:45-4:00)
*[Screen: Landing page with CTA]*

> "Black Budget — private treasury, verifiably compliant. Built for Colosseum Solana Frontier. Try the live demo on Devnet — link in the description. Thanks for watching."

### Recording tips
- Use a clean test wallet pre-funded with USDC (don't reveal mainnet)
- Pre-stage the invoice file on desktop
- Practice once, record twice, pick the better take
- Add captions in YouTube (free) or via Descript (better)
- Thumbnail: black background + BB monogram + "PRIVATE TREASURY ON SOLANA" in large white letters

---

## 5. Competitive landscape

> Differentiation table — paste into deck slide 9 and submission form.

| | **Black Budget** | Squads Protocol | Request Network | Utopia Labs | Brale | Mean Finance |
|---|---|---|---|---|---|---|
| **Chain** | Solana | Solana | EVM (multi-chain) | EVM (Base/Optimism) | Multi-chain | EVM |
| **Treasury vault** | ✓ Token-2022 | ✓ Multisig | ✗ | ✓ Safe-based | ✓ Stablecoin issuer | ✓ |
| **Invoice + AI parsing** | ✓ Claude Vision | ✗ | ✓ (no AI) | partial | ✗ | ✗ |
| **On-chain policy enforcement** | ✓ (cap, auto-approve, dual) | partial (multisig only) | ✗ | partial | ✗ | partial (streaming) |
| **Selective disclosure proofs** | ✓ (3-tier Merkle) | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Token-2022 confidential extension** | ✓ ready | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Compliance queries (parametric)** | ✓ | ✗ | ✗ | ✗ | partial | ✗ |
| **Payroll batch** | ✓ | ✗ | ✓ | ✓ | ✗ | streaming only |
| **AI risk scoring** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

**Why we win**:
- Only product with **first-class privacy** for the treasury use case (Squads is multisig only; Request and Utopia are public-chain by design)
- Only product with **verifiable selective disclosure** (Brale is a fiat issuer, not a treasury OS)
- **Solana-native** with Token-2022 from day one — competitors will need 6-18 months to catch up

**Where we lose (be honest)**:
- Squads has 1000s of DAOs and treasuries on Solana already — distribution moat
- Request has $50M+ tx volume processed historically — credibility
- Confidential Transfers depend on ZK ElGamal program being re-enabled on mainnet

**Strategic response**: position as **complementary to Squads** ("use Squads multisig as your Black Budget company authority") rather than competitive. Squads + Black Budget = secure custody + private operations.

---

## 6. X / Twitter thread

> 8 tweets. Each ≤ 280 chars. Post during US morning (10am-12pm ET) for max reach.

### Tweet 1 (hook)
```
Crypto treasury today: every payment your company makes is public.
Competitors see your burn rate.
Employees see what coworkers earn.
Bad actors target your vault.

We built Black Budget to fix this — private treasury on Solana. 🧵

[attach: 15-second demo GIF]
```

### Tweet 2 (problem)
```
The internet-native company finance stack:

🏦 Banks: slow, no programmability, 3-5 days
🌐 Public crypto: fast + cheap, but TELEGRAPHS every payment
📊 Spreadsheets: private, but zero enforcement, zero audit trail

Pick one. Lose two. Until now.
```

### Tweet 3 (solution intro)
```
Black Budget runs your entire treasury on Solana:

1. Upload invoice (PDF)
2. AI parses vendor + amount + risk
3. Policy auto-evaluates (auto-approve / dual-sig / block)
4. Token-2022 USDC executes from vault

Real end-to-end. Real on-chain.
```

### Tweet 4 (the insight)
```
The core innovation: SELECTIVE DISCLOSURE.

One Merkle root. Three audiences:

📈 Investor → runway + burn rate (no amounts)
🔍 Auditor → pseudonymized amounts
🏛️ Regulator → full visibility

All from the same root. All verifiable on-chain.
```

### Tweet 5 (programmable compliance)
```
Beyond disclosure: programmable compliance proofs.

"Is runway > 6 months?" → YES (anchored on-chain)
"Is admin spend < 30%?" → YES
"No vendor concentration > 50%?" → YES

Prove discipline without revealing data.

Constraint hash is your receipt.
```

### Tweet 6 (real, not vapor)
```
This is shipping, not a slide:

✓ Live on Solana Devnet
✓ 1,500 LOC Anchor program
✓ 10 on-chain instructions
✓ 69+ tests
✓ 4 audit passes, 0 Critical/High open
✓ Token-2022 + Confidential Transfer enabled

Try it: black-budget.vercel.app
```

### Tweet 7 (Solana-native + Arcium roadmap)
```
Why Solana? Privacy is a stack, not a feature.

🔓 Today: selective disclosure (Merkle root, 3-tier views)
🔒 Q3 2026: encrypted balances via @ArciumHQ Confidential SPL
🔐 Q4 2026: encrypted policy eval + compliance proofs in Arcium MXE

Same chain. Same vault. Three composable upgrades.
```

### Tweet 8 (CTA + Colosseum)
```
Built for @colosseum Solana Frontier Hackathon.

→ Demo: black-budget.vercel.app
→ Code: github.com/yaeugen12/black-budget
→ Video: [YouTube link]

DM if you're a Solana-native startup with 5+ contractors on USDC payroll — looking for design partners.

cc @solana @SuperteamDAO
```

---

## 7. Pre-submission checklist

### Hard requirements (do or fail)
- [ ] Demo video recorded + uploaded (YouTube unlisted)
- [ ] Live deployment URL working (`black-budget.vercel.app` or similar)
- [ ] GitHub repo public + main branch matches local
- [ ] Submission form filled per Section 2 above
- [ ] At least 1 successful on-chain demo TX recorded with Explorer link
- [ ] README has demo video embed link

### High value (do if you have 4+ hours)
- [ ] Pitch deck exported as PDF + uploaded to deck.link or pitch.com (linkable)
- [ ] X thread posted from Section 6
- [ ] OG image preview working (test with twitter.com card validator)
- [ ] Devnet faucet flow tested — judges can try without setup
- [ ] AUDIT_FINDINGS_RESOLVED.md linked in README

### Polish (do if you have time after)
- [ ] Mainnet deploy (5 SOL, ~30 min)
- [ ] Custom domain (blackbudget.fi or similar)
- [ ] Loom walkthrough alongside YouTube video (different audiences)
- [ ] Solana Cookbook entry submission (Token-2022 + selective disclosure pattern)

### Pre-submission verification
- [ ] `pnpm test` passes locally
- [ ] `pnpm build` succeeds with no errors
- [ ] All on-chain instructions still working on devnet (run `full-user-simulation.mjs`)
- [ ] `wallets/` confirmed not in repo (`git ls-files wallets/` returns empty)
- [ ] No `.env.local` or API keys in any committed file
- [ ] OG image renders correctly at /opengraph-image (visit URL directly)

### Day-of checklist
- [ ] Re-test demo on a fresh wallet (judges will have fresh wallets)
- [ ] Take 5 high-res screenshots for deck:
  1. Dashboard with live state
  2. Invoice parsed by AI
  3. Policy enforcement view
  4. Successful on-chain payment with Explorer link
  5. Proof verification page
- [ ] DM Colosseum team if any submission issue

---

**Generated**: 2026-05-11 · Maintained alongside `AUDIT_FINDINGS_RESOLVED.md` and `README.md`.
