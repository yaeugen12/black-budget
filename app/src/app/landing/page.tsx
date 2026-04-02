"use client";

import {
  Shield, Zap, Eye, Lock, ArrowRight, CheckCircle2,
  FileText, Users, BarChart3, Code2, ExternalLink,
  Sparkles, ChevronRight,
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
    title: "Confidential Payments",
    description: "Token-2022 with Confidential Transfer extension. Payment amounts are hidden from public view on Solana.",
    badge: "Token-2022",
  },
  {
    icon: Eye,
    title: "Selective Disclosure",
    description: "Investors see burn rate. Auditors see all amounts. Regulators see everything. Same Merkle root, different views.",
    badge: "ZK-Ready",
  },
  {
    icon: Users,
    title: "Role-Based Access",
    description: "Owner, Approver, Viewer, Contractor. Each role has specific permissions enforced by the Solana program.",
    badge: "4 Roles",
  },
  {
    icon: BarChart3,
    title: "Payroll Batch Execution",
    description: "Run payroll for your entire team in one click. Each payment creates an on-chain record with policy enforcement.",
    badge: "Batch TX",
  },
];

const stats = [
  { value: "916", label: "Lines of Rust" },
  { value: "8", label: "App Pages" },
  { value: "46", label: "Tests Passing" },
  { value: "6", label: "On-Chain Instructions" },
];

const techStack = [
  { name: "Solana", detail: "Program (Anchor 0.30)" },
  { name: "Token-2022", detail: "Confidential Transfers" },
  { name: "Next.js 16", detail: "App Router + API Routes" },
  { name: "Claude API", detail: "Vision for Invoice Parsing" },
  { name: "TypeScript", detail: "Frontend + Backend" },
  { name: "Vitest", detail: "46 Tests, 4 Layers" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" className="text-primary" />
                <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" className="text-primary opacity-60" />
                <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" className="text-primary opacity-60" />
                <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" className="text-primary opacity-30" />
              </svg>
            </div>
            <span className="font-semibold text-sm">Black Budget</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/yaeugen12/black-budget"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost text-[13px] py-1.5"
            >
              <Code2 className="w-4 h-4" /> GitHub
            </a>
            <Link href="/" className="btn-primary text-[13px] py-2 px-4">
              Launch App <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 badge badge-info mb-6 text-[12px] px-3 py-1.5">
            <Lock className="w-3 h-3" />
            Built for Solana Frontier Hackathon 2026
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
            The private finance OS
            <br />
            <span className="text-primary">for internet companies</span>
          </h1>

          <p className="text-lg text-muted-foreground mt-6 max-w-xl mx-auto leading-relaxed">
            Invoices, payroll, treasury policies, and approvals —
            executed on Solana with confidential transfers and selective disclosure proofs.
          </p>

          <div className="flex items-center justify-center gap-4 mt-8">
            <Link href="/" className="btn-primary py-3 px-6 text-[15px]">
              Launch App <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com/yaeugen12/black-budget"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary py-3 px-6 text-[15px]"
            >
              <Code2 className="w-4 h-4" /> View Source
            </a>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 mt-12">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold font-mono text-primary">{s.value}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold">How It Works</h2>
            <p className="text-muted-foreground mt-2">Four steps from invoice to confidential payment</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: "1", title: "Upload Invoice", desc: "PDF, PNG, or photo. AI extracts everything.", icon: FileText },
              { step: "2", title: "Policy Evaluates", desc: "Auto-approve, require approval, or block.", icon: Shield },
              { step: "3", title: "Payment Executes", desc: "USDC transfers via Token-2022 on Solana.", icon: Zap },
              { step: "4", title: "Prove Selectively", desc: "Show investors, auditors, regulators only what they need.", icon: Eye },
            ].map((item, i) => (
              <div key={item.step} className="card p-5 text-center relative animate-in" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                  {item.step}
                </div>
                <item.icon className="w-6 h-6 text-primary mx-auto mt-2 mb-3" />
                <h3 className="text-[14px] font-semibold">{item.title}</h3>
                <p className="text-[12px] text-muted-foreground mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold">Built Different</h2>
            <p className="text-muted-foreground mt-2">Every feature is real, tested, and deployed on Solana Devnet</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <div key={f.title} className="card p-5 hover:border-primary/20 transition-all group" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="badge badge-neutral">{f.badge}</span>
                </div>
                <h3 className="text-[14px] font-semibold">{f.title}</h3>
                <p className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Selective Disclosure Visual */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold">Same Data, Different Views</h2>
            <p className="text-muted-foreground mt-2">Cryptographic proofs ensure each audience sees only what they need</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-[14px]">Investor</h3>
              </div>
              <div className="space-y-2 text-[12px]">
                <div className="flex items-center gap-2 text-success"><Eye className="w-3 h-3" /> Burn rate & runway</div>
                <div className="flex items-center gap-2 text-success"><Eye className="w-3 h-3" /> Category breakdown</div>
                <div className="flex items-center gap-2 text-success"><Eye className="w-3 h-3" /> Treasury balance</div>
                <div className="flex items-center gap-2 text-destructive"><Lock className="w-3 h-3" /> Individual payments</div>
                <div className="flex items-center gap-2 text-destructive"><Lock className="w-3 h-3" /> Vendor identities</div>
              </div>
            </div>

            <div className="card-highlight p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-[14px]">Auditor</h3>
              </div>
              <div className="space-y-2 text-[12px]">
                <div className="flex items-center gap-2 text-success"><Eye className="w-3 h-3" /> All amounts & dates</div>
                <div className="flex items-center gap-2 text-success"><Eye className="w-3 h-3" /> All categories</div>
                <div className="flex items-center gap-2 text-success"><Eye className="w-3 h-3" /> Payment IDs</div>
                <div className="flex items-center gap-2 text-warning"><Eye className="w-3 h-3" /> Pseudonymized vendors</div>
                <div className="flex items-center gap-2 text-destructive"><Lock className="w-3 h-3" /> Real identities</div>
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-[14px]">Regulator</h3>
              </div>
              <div className="space-y-2 text-[12px]">
                <div className="flex items-center gap-2 text-success"><Eye className="w-3 h-3" /> Everything visible</div>
                <div className="flex items-center gap-2 text-success"><Eye className="w-3 h-3" /> Real vendor names</div>
                <div className="flex items-center gap-2 text-success"><Eye className="w-3 h-3" /> Wallet addresses</div>
                <div className="flex items-center gap-2 text-success"><Eye className="w-3 h-3" /> TX hashes</div>
                <div className="flex items-center gap-2 text-muted-foreground"><Lock className="w-3 h-3" /> Requires 2/2 multisig</div>
              </div>
            </div>
          </div>

          <div className="text-center mt-6">
            <p className="text-[12px] text-muted-foreground">
              All three views share the same Merkle root — cryptographic proof they come from the same dataset
            </p>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold">Tech Stack</h2>
            <p className="text-muted-foreground mt-2">Production-grade infrastructure, not a weekend prototype</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {techStack.map((t) => (
              <div key={t.name} className="card p-4 flex items-center gap-3">
                <Code2 className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <div className="text-[13px] font-semibold">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground">{t.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold">
            Private. Programmable. Provable.
          </h2>
          <p className="text-muted-foreground mt-4 text-lg">
            The first programmable private back-office for internet-native companies.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8">
            <Link href="/" className="btn-primary py-3 px-8 text-[15px]">
              Try the Demo <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="flex items-center justify-center gap-6 mt-8 text-[12px] text-muted-foreground">
            <a
              href="https://explorer.solana.com/address/3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k?cluster=devnet"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-primary transition-colors"
            >
              Program on Devnet <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://github.com/yaeugen12/black-budget"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-primary transition-colors"
            >
              Source Code <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Black Budget — Solana Frontier Hackathon 2026</span>
          <span>Built with Anchor, Next.js, and Claude AI</span>
        </div>
      </footer>
    </div>
  );
}
