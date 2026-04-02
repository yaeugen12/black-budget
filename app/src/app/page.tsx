"use client";

import {
  Eye,
  EyeOff,
  FileText,
  AlertTriangle,
  ExternalLink,
  Plus,
  Wallet,
  ChevronRight,
  CheckCircle2,
  Circle,
  ArrowRight,
  Shield,
  Upload,
  Stamp,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCompany } from "@/lib/company-context";
import { ConfidentialBadge } from "@/components/confidential-badge";

export default function Dashboard() {
  const { company, companyPDA, payments, vaultBalance, depositToVault } = useCompany();
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);

  const monthlySpent = company ? company.monthlySpent.toNumber() / 1_000_000 : 0;
  const autoApproveLimit = company ? company.policy.autoApproveLimit.toNumber() / 1_000_000 : 5000;
  const memberCount = company ? company.memberCount : 1;
  const paymentCount = company ? company.paymentNonce.toNumber() : 0;
  const pendingPayments = payments.filter((p) => p.account.status.pending !== undefined);
  const runway = monthlySpent > 0 ? vaultBalance / monthlySpent : 0;

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) return;
    setDepositing(true);
    try {
      await depositToVault(amt);
      setShowDeposit(false);
      setDepositAmount("");
    } catch {} finally {
      setDepositing(false);
    }
  };

  const fmt = (n: number) =>
    balanceVisible ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}` : "--------";

  const runwayLabel =
    monthlySpent === 0
      ? "No spend yet"
      : runway > 18
        ? "Healthy runway"
        : runway > 8
          ? "Watch burn"
          : "Needs attention";

  return (
    <div className="page-shell mx-auto max-w-6xl space-y-6 animate-in">
      <section className="card overflow-hidden px-6 py-6 lg:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="eyebrow">Treasury</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">
              {company?.name || "Dashboard"}
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted-foreground">
              See the balance, the items waiting on approvals, and the most recent treasury activity.
            </p>
            {companyPDA && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a
                  href={`https://explorer.solana.com/address/${companyPDA.toBase58()}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/55 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-primary"
                >
                  <span className="text-mono">
                    {companyPDA.toBase58().slice(0, 12)}...{companyPDA.toBase58().slice(-4)}
                  </span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <ConfidentialBadge />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setBalanceVisible(!balanceVisible)} className="btn-ghost">
              {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {balanceVisible ? "Hide values" : "Show values"}
            </button>
            <button onClick={() => setShowDeposit(!showDeposit)} className="btn-secondary text-[13px] py-2 px-4">
              <Wallet className="h-4 w-4" /> Deposit
            </button>
            <Link href="/invoices" className="btn-primary text-[13px] py-2 px-4">
              <Plus className="h-4 w-4" /> New Invoice
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="metric-tile">
            <p className="text-label mb-2">Treasury Balance</p>
            <div className="stat-value">{fmt(vaultBalance)}</div>
            <p className="mt-2 text-[12px] text-muted-foreground">Live vault balance</p>
          </div>
          <div className="metric-tile">
            <p className="text-label mb-2">Pending Approvals</p>
            <div className="stat-value">{pendingPayments.length}</div>
            <p className="mt-2 text-[12px] text-muted-foreground">
              {pendingPayments.length > 0 ? "Needs signer attention" : "Nothing waiting right now"}
            </p>
          </div>
          <div className="metric-tile">
            <p className="text-label mb-2">Runway</p>
            <div className="stat-value">
              {monthlySpent === 0 ? "N/A" : `${runway.toFixed(1)} mo`}
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">{runwayLabel}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="badge badge-neutral">{memberCount} team member{memberCount !== 1 ? "s" : ""}</span>
          <span className="badge badge-info">Auto-approve under {fmt(autoApproveLimit)}</span>
          <span className="badge badge-neutral">
            {paymentCount} payment request{paymentCount !== 1 ? "s" : ""} tracked
          </span>
          <span className={pendingPayments.length > 0 ? "badge badge-warning" : "badge badge-success"}>
            {pendingPayments.length > 0 ? `${pendingPayments.length} waiting` : "Queue clear"}
          </span>
        </div>
      </section>

      {showDeposit && (
        <div className="card p-4 animate-in">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <p className="text-label mb-2">Deposit USDC</p>
              <input
                type="number"
                placeholder="Amount (USDC)"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="input max-w-xs"
                min="1"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleDeposit}
                disabled={depositing || !depositAmount}
                className="btn-primary text-[13px] py-2 px-4"
              >
                {depositing ? "Sending..." : "Deposit to Vault"}
              </button>
              <button onClick={() => setShowDeposit(false)} className="btn-ghost text-[13px]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {(() => {
        const hasPolicies = company && company.policy.autoApproveLimit.toNumber() > 0;
        const hasPayments = payments.length > 0;
        const hasExecuted = payments.some(p => p.account.status.executed !== undefined);
        const hasVaultBalance = vaultBalance > 0;
        const totalSteps = 5;
        const completedSteps = [hasPolicies, hasVaultBalance, hasPayments, hasExecuted].filter(Boolean).length;
        const allDone = completedSteps >= 4;

        const steps = [
          {
            done: hasPolicies,
            icon: Shield,
            title: "Set treasury policies",
            desc: "Auto-approve, dual-approval threshold, monthly burn cap",
            hint: "Sidebar → Policies → adjust sliders → Save",
            href: "/policies",
          },
          {
            done: hasVaultBalance,
            icon: Wallet,
            title: "Fund the vault",
            desc: "Deposit USDC so payments can be executed",
            hint: "Click the Deposit button above → enter amount → sign",
            href: undefined,
            action: () => setShowDeposit(true),
          },
          {
            done: hasPayments,
            icon: Upload,
            title: "Upload an invoice or create a payment",
            desc: "AI parses the invoice, routes it through policy, creates on-chain payment",
            hint: "Sidebar → Invoices → drag a PDF/PNG → save → enter wallet → create payment",
            href: "/invoices",
          },
          {
            done: hasExecuted,
            icon: Stamp,
            title: "Approve & execute a payment",
            desc: "Sign the payment, then execute to transfer USDC from vault",
            hint: "Sidebar → Approvals → Approve → Execute",
            href: "/approvals",
          },
          {
            done: false, // always show proofs as a next step
            icon: Eye,
            title: "Generate selective disclosure proofs",
            desc: "Investor sees aggregates, auditor sees pseudonymized data, regulator sees everything",
            hint: "Sidebar → Proofs → pick a view → Anchor On-Chain",
            href: "/proofs",
          },
        ];

        if (allDone) return null;

        return (
          <div className="card p-6 animate-in-delay-1">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="section-title">Demo Walkthrough</h3>
                <p className="text-[12px] text-muted-foreground mt-1">
                  {completedSteps}/{totalSteps} steps done — follow the path to see the full treasury workflow
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div key={i} className={`h-1.5 w-6 rounded-full ${i < completedSteps ? "bg-success" : "bg-secondary"}`} />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {steps.map((step, i) => {
                const Icon = step.icon;
                const isNext = !step.done && steps.slice(0, i).every(s => s.done);
                const cls = `flex items-center gap-4 w-full rounded-xl px-4 py-3 text-left transition-all ${
                  step.done
                    ? "bg-success/5 border border-success/10"
                    : isNext
                      ? "bg-primary/5 border border-primary/20 hover:border-primary/40"
                      : "bg-secondary/30 border border-border opacity-60"
                }`;

                const inner = (<>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      step.done ? "bg-success/10" : isNext ? "bg-primary/10" : "bg-secondary"
                    }`}>
                      {step.done
                        ? <CheckCircle2 className="h-4 w-4 text-success" />
                        : <Icon className={`h-4 w-4 ${isNext ? "text-primary" : "text-muted-foreground"}`} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium ${step.done ? "line-through text-muted-foreground" : ""}`}>
                        {step.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {step.done ? step.desc : isNext ? step.hint : step.desc}
                      </p>
                    </div>
                    {!step.done && isNext && (
                      <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                    )}
                    {step.done && (
                      <span className="text-[10px] text-success font-medium shrink-0">Done</span>
                    )}
                  </>
                );

                if (step.href) {
                  return <Link key={step.title} href={step.href} className={cls}>{inner}</Link>;
                }
                return <button key={step.title} onClick={step.action} className={cls}>{inner}</button>;
              })}
            </div>
          </div>
        );
      })()}

      {pendingPayments.length > 0 && (
        <Link href="/approvals" className="card flex items-center gap-3 px-4 py-3 transition-colors hover:border-warning/30 animate-in-delay-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10 shrink-0">
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium">{pendingPayments.length} payment{pendingPayments.length > 1 ? "s" : ""} awaiting approval</p>
            <p className="text-[12px] text-muted-foreground">Open approvals to sign or reject pending requests.</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      )}

      <div className="card animate-in-delay-4">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="section-title">Recent Activity</h3>
            <p className="text-[12px] text-muted-foreground">Latest payment requests and execution status.</p>
          </div>
          <Link href="/payments" className="btn-ghost text-[12px] py-1 px-2">
            View all
          </Link>
        </div>

        {payments.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-[13px] font-medium">No payments yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Upload an invoice to start the treasury workflow.</p>
            <Link href="/invoices" className="btn-primary mt-4 inline-flex text-[13px] py-2 px-4">
              <Plus className="h-4 w-4" /> New Invoice
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {payments.slice(0, 6).map((payment) => {
              const status = payment.account.status;
              const isPending = status.pending !== undefined;
              const isApproved = status.approved !== undefined;
              const isExecuted = status.executed !== undefined;
              const isRejected = status.rejected !== undefined;

              return (
                <div
                  key={payment.publicKey.toBase58()}
                  className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-[rgba(255,255,255,0.015)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`h-2 w-2 shrink-0 rounded-full ${
                      isExecuted ? "bg-success" : isApproved ? "bg-primary" : isPending ? "bg-warning pulse-dot" : "bg-destructive"
                    }`} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">
                        Payment #{payment.account.paymentId.toNumber()}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {payment.account.memo || "No memo"} · {payment.account.approvals.length}/{payment.account.requiredApprovals} approvals
                      </p>
                    </div>
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <p className="text-[13px] font-medium text-mono">
                      {balanceVisible ? `$${(payment.account.amount.toNumber() / 1_000_000).toLocaleString()}` : "••••"}
                    </p>
                    {isExecuted && <span className="badge badge-success">Done</span>}
                    {isPending && <span className="badge badge-warning">Pending</span>}
                    {isRejected && <span className="badge badge-danger">Rejected</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
