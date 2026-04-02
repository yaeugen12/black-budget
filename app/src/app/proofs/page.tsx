"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  Shield,
  Download,
  Copy,
  CheckCircle2,
  Lock,
  Unlock,
  BarChart3,
  Users,
  FileText,
  Hash,
} from "lucide-react";

type ProofView = "investor" | "auditor" | "regulator" | null;

const investorView = {
  title: "Investor Proof",
  subtitle: "Aggregate financial health — no individual transaction details",
  fields: [
    { label: "Burn Rate", value: "$47,200/mo", visible: true },
    { label: "Runway", value: "6.0 months", visible: true },
    { label: "Treasury Balance", value: "$284,750", visible: true },
    { label: "Team Size", value: "8 members", visible: true },
    { label: "Payroll %", value: "60%", visible: true },
    { label: "Vendor %", value: "23%", visible: true },
    { label: "Individual Payments", value: "REDACTED", visible: false },
    { label: "Vendor Names", value: "REDACTED", visible: false },
    { label: "Payment Amounts", value: "REDACTED", visible: false },
    { label: "Wallet Addresses", value: "REDACTED", visible: false },
  ],
  merkleRoot: "0x7a3f...e91d",
  signature: "0x4b2c...8f3a",
};

const auditorView = {
  title: "Auditor Proof",
  subtitle: "Full financial detail with pseudonymized vendor identities",
  payments: [
    { id: "BB-001", vendor: "Vendor-A7F3", amount: 3200, category: "Contractor", date: "2026-03-28" },
    { id: "BB-002", vendor: "Vendor-E2B1", amount: 12800, category: "Subscription", date: "2026-03-26" },
    { id: "BB-003", vendor: "PAYROLL-BATCH", amount: 28500, category: "Payroll", date: "2026-03-25" },
    { id: "BB-004", vendor: "Vendor-C9D4", amount: 7500, category: "Vendor", date: "2026-03-24" },
    { id: "BB-005", vendor: "Vendor-F1A8", amount: 45, category: "Subscription", date: "2026-03-22" },
  ],
  totals: {
    payroll: 28500,
    vendors: 10700,
    subscriptions: 5200,
    contractors: 3200,
    total: 47600,
  },
  merkleRoot: "0x7a3f...e91d",
};

const regulatorView = {
  title: "Regulator Proof",
  subtitle: "Complete disclosure — all identities, amounts, and wallet addresses",
  note: "Full KYC/AML-compliant export with real vendor identities and on-chain transaction hashes",
};

export default function ProofsPage() {
  const [activeView, setActiveView] = useState<ProofView>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Selective Disclosure</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate cryptographic proofs that reveal only what each audience needs to see
        </p>
      </div>

      {/* Proof Type Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Investor */}
        <button
          onClick={() => setActiveView("investor")}
          className={`glass rounded-xl p-6 text-left transition-all hover:glow-purple ${
            activeView === "investor" ? "ring-2 ring-primary glow-purple" : ""
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Investor View</h3>
              <p className="text-xs text-muted-foreground">Aggregates only</p>
            </div>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-[var(--success)]">
              <Eye className="w-3 h-3" /> Burn rate, runway, category %
            </div>
            <div className="flex items-center gap-2 text-destructive">
              <EyeOff className="w-3 h-3" /> No individual payments
            </div>
            <div className="flex items-center gap-2 text-destructive">
              <EyeOff className="w-3 h-3" /> No vendor identities
            </div>
          </div>
        </button>

        {/* Auditor */}
        <button
          onClick={() => setActiveView("auditor")}
          className={`glass rounded-xl p-6 text-left transition-all hover:glow-purple ${
            activeView === "auditor" ? "ring-2 ring-primary glow-purple" : ""
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-medium">Auditor View</h3>
              <p className="text-xs text-muted-foreground">Full detail, pseudonymized</p>
            </div>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-[var(--success)]">
              <Eye className="w-3 h-3" /> All amounts & categories
            </div>
            <div className="flex items-center gap-2 text-[var(--success)]">
              <Eye className="w-3 h-3" /> All dates & payment IDs
            </div>
            <div className="flex items-center gap-2 text-destructive">
              <EyeOff className="w-3 h-3" /> Vendor names pseudonymized
            </div>
          </div>
        </button>

        {/* Regulator */}
        <button
          onClick={() => setActiveView("regulator")}
          className={`glass rounded-xl p-6 text-left transition-all hover:glow-purple ${
            activeView === "regulator" ? "ring-2 ring-primary glow-purple" : ""
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="font-medium">Regulator View</h3>
              <p className="text-xs text-muted-foreground">Complete disclosure</p>
            </div>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-[var(--success)]">
              <Unlock className="w-3 h-3" /> Everything visible
            </div>
            <div className="flex items-center gap-2 text-[var(--success)]">
              <Unlock className="w-3 h-3" /> Real vendor identities
            </div>
            <div className="flex items-center gap-2 text-[var(--success)]">
              <Unlock className="w-3 h-3" /> On-chain TX hashes
            </div>
          </div>
        </button>
      </div>

      {/* Proof Output */}
      {activeView === "investor" && (
        <div className="space-y-4">
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">{investorView.title}</h3>
              <span className="badge-info text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3" /> Selective Disclosure
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{investorView.subtitle}</p>

            <div className="grid grid-cols-2 gap-3">
              {investorView.fields.map((field, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-4 py-3 ${
                    field.visible ? "bg-secondary/50" : "bg-destructive/5 border border-destructive/20"
                  }`}
                >
                  <div className="text-xs text-muted-foreground">{field.label}</div>
                  <div className={`text-sm font-mono mt-1 flex items-center gap-2 ${
                    field.visible ? "" : "text-destructive"
                  }`}>
                    {field.visible ? (
                      <Eye className="w-3 h-3 text-[var(--success)]" />
                    ) : (
                      <EyeOff className="w-3 h-3" />
                    )}
                    {field.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Merkle Proof */}
          <div className="glass rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Hash className="w-4 h-4 text-primary" />
              <div>
                <div className="text-xs text-muted-foreground">Merkle Root (verifiable on-chain)</div>
                <div className="text-sm font-mono">{investorView.merkleRoot}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center gap-1"
              >
                {copied ? <CheckCircle2 className="w-3 h-3 text-[var(--success)]" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground flex items-center gap-1">
                <Download className="w-3 h-3" /> Export JSON
              </button>
            </div>
          </div>
        </div>
      )}

      {activeView === "auditor" && (
        <div className="space-y-4">
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">{auditorView.title}</h3>
              <span className="badge-info text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3" /> Pseudonymized
              </span>
            </div>

            {/* Payment Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-4">ID</th>
                    <th className="py-2 pr-4">Vendor</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {auditorView.payments.map((p) => (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="py-3 pr-4 font-mono text-xs">{p.id}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{p.vendor}</td>
                      <td className="py-3 pr-4">{p.category}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{p.date}</td>
                      <td className="py-3 text-right font-mono">${p.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-medium">
                    <td colSpan={4} className="py-3 pr-4">Total</td>
                    <td className="py-3 text-right font-mono">${auditorView.totals.total.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="glass rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Hash className="w-4 h-4 text-primary" />
              <div>
                <div className="text-xs text-muted-foreground">Same Merkle Root — proves same dataset</div>
                <div className="text-sm font-mono">{auditorView.merkleRoot}</div>
              </div>
            </div>
            <button className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground flex items-center gap-1">
              <Download className="w-3 h-3" /> Export CSV
            </button>
          </div>
        </div>
      )}

      {activeView === "regulator" && (
        <div className="glass rounded-xl p-8 text-center">
          <Shield className="w-12 h-12 mx-auto text-amber-400 mb-4" />
          <h3 className="text-xl font-bold">Full Disclosure Mode</h3>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            {regulatorView.note}
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            Requires multi-sig authorization from 2+ Owners to generate
          </p>
          <button className="mt-4 px-6 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-colors">
            Request Full Disclosure (2/2 signatures required)
          </button>
        </div>
      )}
    </div>
  );
}
