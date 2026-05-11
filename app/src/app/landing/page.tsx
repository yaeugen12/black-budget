"use client";

import {
  Shield,
  Zap,
  Eye,
  Lock,
  ArrowRight,
  FileText,
  Users,
  BarChart3,
  Code2,
  ExternalLink,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";

const features = [
  {
    icon: Sparkles,
    title: "AI Invoice Processing",
    description: "Upload a PDF or photo. Claude Vision extracts vendor, amount, line items, and risk flags in seconds.",
    badge: "Claude API",
  },
  {
    icon: Shield,
    title: "Treasury Policies as Code",
    description: "Auto-approve under $5K. Dual-approval over $15K. Monthly burn cap. Runway protection. All enforced on-chain.",
    badge: "On-Chain",
  },
  {
    icon: Lock,
    title: "Confidential-Ready Payments",
    description: "Token-2022 with Confidential Transfer extension enabled, ready for encrypted amounts once devnet proofs return.",
    badge: "Token-2022",
  },
  {
    icon: Eye,
    title: "Selective Disclosure",
    description: "Investors see burn rate. Auditors see all amounts. Regulators see everything. Same dataset, different proof surfaces.",
    badge: "Proofs",
  },
  {
    icon: Users,
    title: "Role-Based Access",
    description: "Owner, Approver, Viewer, Contractor. Each role has clear permissions enforced by the Solana program.",
    badge: "4 Roles",
  },
  {
    icon: BarChart3,
    title: "Compliance Queries",
    description: "Evaluate runway, category caps, vendor concentration, and custom constraints, then anchor the result on-chain.",
    badge: "New",
  },
];

const stats = [
  { value: "54", label: "Tests passing" },
  { value: "10", label: "On-chain instructions" },
  { value: "2", label: "Proof systems" },
  { value: "1", label: "Treasury workflow" },
];

const proofViews = [
  { title: "Investor", subtitle: "Burn, runway, category mix", accent: "text-primary" },
  { title: "Auditor", subtitle: "Amounts + dates, pseudonymized vendors", accent: "text-emerald-400" },
  { title: "Regulator", subtitle: "Full disclosure", accent: "text-amber-400" },
];

const techStack = [
  { name: "Solana", detail: "Anchor program on Devnet" },
  { name: "Token-2022", detail: "Confidential-ready mint" },
  { name: "Next.js 16", detail: "App Router + API routes" },
  { name: "Claude API", detail: "Vision invoice parsing" },
  { name: "TypeScript", detail: "UI + services" },
  { name: "Vitest", detail: "48 tests in workspace" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <nav className="fixed top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">Black Budget</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Private Finance OS</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/yaeugen12/black-budget"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost hidden text-[13px] py-1.5 sm:inline-flex"
            >
              <Code2 className="h-4 w-4" /> GitHub
            </a>
            <Link href="/" className="btn-primary text-[13px] py-2 px-4">
              Launch App <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      <section className="px-6 pb-20 pt-28">
        <div className="mx-auto max-w-6xl">
          <div className="hero-surface grid overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative px-7 py-10 lg:px-10 lg:py-12">
              <div className="eyebrow">
                <Sparkles className="h-3.5 w-3.5" />
                Built for Solana Frontier Hackathon 2026
              </div>

              <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance lg:text-6xl">
                Finance controls, approvals, and proofs for internet-native companies.
              </h1>
              <p className="mt-6 max-w-2xl text-[16px] leading-8 text-muted-foreground">
                Black Budget turns invoices, treasury policy, payroll, and stakeholder reporting into one operational surface on Solana.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/" className="btn-primary py-3 px-6 text-[15px]">
                  Open the Demo <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="https://github.com/yaeugen12/black-budget"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary py-3 px-6 text-[15px]"
                >
                  <Code2 className="h-4 w-4" /> View Source
                </a>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="metric-tile">
                    <div className="text-2xl font-semibold tracking-tight text-foreground">{stat.value}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border/80 px-7 py-10 lg:border-l lg:border-t-0 lg:px-10 lg:py-12">
              <div className="space-y-4">
                <div className="card-highlight p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-label mb-1">Proof Surfaces</p>
                      <h3 className="section-title">Same treasury dataset, different disclosure modes</h3>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12">
                      <Eye className="h-5 w-5 text-primary" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {proofViews.map((view) => (
                      <div key={view.title} className="flex items-center justify-between rounded-2xl border border-border bg-secondary/45 px-4 py-3">
                        <div>
                          <p className={`text-[13px] font-semibold ${view.accent}`}>{view.title}</p>
                          <p className="text-[12px] text-muted-foreground">{view.subtitle}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="card p-5">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <p className="section-title">Invoice to policy routing</p>
                    <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                      Parse an invoice, classify the spend, and route it into approval or execution logic.
                    </p>
                  </div>
                  <div className="card p-5">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                      <Wallet className="h-5 w-5 text-emerald-400" />
                    </div>
                    <p className="section-title">Token-2022 treasury vault</p>
                    <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                      Live vault balances, role-based spend controls, and proof-friendly accounting rails.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <div className="eyebrow justify-center">
              <Shield className="h-3.5 w-3.5" />
              Core product surface
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight">Built for live demos, not just screenshots</h2>
            <p className="mx-auto mt-3 max-w-2xl text-[15px] text-muted-foreground">
              The strongest parts of the product are the parts a judge can actually click through.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="card p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="badge badge-neutral">{feature.badge}</span>
                </div>
                <h3 className="section-title">{feature.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border px-6 py-20">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <div className="eyebrow">
              <Lock className="h-3.5 w-3.5" />
              Selective disclosure
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight">One ledger, multiple truths, one proof backbone.</h2>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-muted-foreground">
              Investors, auditors, and regulators all need different slices of the same operating data. The UI makes that logic feel obvious.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="card p-5">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h3 className="mt-4 section-title">Investor</h3>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">Burn, runway, category mix, treasury health.</p>
            </div>
            <div className="card-highlight p-5">
              <FileText className="h-5 w-5 text-emerald-400" />
              <h3 className="mt-4 section-title">Auditor</h3>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">Amounts, dates, payment IDs, pseudonymized recipients.</p>
            </div>
            <div className="card p-5">
              <Shield className="h-5 w-5 text-amber-400" />
              <h3 className="mt-4 section-title">Regulator</h3>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">Full disclosure, anchored to the same merkle root.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <div className="eyebrow justify-center">
              <Code2 className="h-3.5 w-3.5" />
              Implementation stack
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight">A serious stack behind the demo</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {techStack.map((item) => (
              <div key={item.name} className="card p-4">
                <p className="section-title">{item.name}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <div className="hero-surface px-8 py-12 lg:px-12">
            <div className="eyebrow justify-center">
              <Zap className="h-3.5 w-3.5" />
              Live on Solana Devnet
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight lg:text-4xl">
              Private. Programmable. Provable.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">
              The product already feels like a finance operating surface, not just a collection of disconnected hackathon features.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/" className="btn-primary py-3 px-8 text-[15px]">
                Try the Demo <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="https://explorer.solana.com/address/3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k?cluster=devnet"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary py-3 px-8 text-[15px]"
              >
                Program on Devnet <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Black Budget — Solana Frontier Hackathon 2026</span>
          <span>Built with Anchor, Next.js, Token-2022, and Claude</span>
        </div>
      </footer>
    </div>
  );
}
