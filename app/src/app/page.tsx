"use client";

import {
  Eye,
  EyeOff,
  FileText,
  Shield,
  AlertTriangle,
  ExternalLink,
  Plus,
  Wallet,
  Activity,
  ChevronRight,
  Sparkles,
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

  const totalSpent = company ? company.totalSpent.toNumber() / 1_000_000 : 0;
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
      <section className="hero-surface overflow-hidden px-6 py-7 lg:px-8 lg:py-8">
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="eyebrow">
              <Activity className="h-3.5 w-3.5" />
              Treasury control center
            </div>

            <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">
                  {company?.name || "Dashboard"}
                </h1>
                {companyPDA && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
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

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="metric-tile">
                <p className="text-label mb-2">Treasury Balance</p>
                <div className="stat-value">{fmt(vaultBalance)}</div>
                <p className="mt-2 text-[12px] text-muted-foreground">Live Token-2022 vault balance via RPC</p>
              </div>
              <div className="metric-tile">
                <p className="text-label mb-2">Total Spent</p>
                <div className="stat-value">{fmt(totalSpent)}</div>
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Across {paymentCount} payment{paymentCount !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="metric-tile">
                <p className="text-label mb-2">Runway Signal</p>
                <div className="stat-value">
                  {monthlySpent === 0 ? "N/A" : `${runway.toFixed(1)} mo`}
                </div>
                <p className="mt-2 text-[12px] text-muted-foreground">{runwayLabel}</p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-label mb-1">Operating Snapshot</p>
                <h2 className="section-title">What needs attention right now</h2>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/50 px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium">Pending approvals</p>
                  <p className="text-[12px] text-muted-foreground">Payments waiting for signer action</p>
                </div>
                <span className="badge badge-warning">{pendingPayments.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/50 px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium">Team members</p>
                  <p className="text-[12px] text-muted-foreground">Wallet roles active in the company</p>
                </div>
                <span className="badge badge-neutral">{memberCount}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/50 px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium">Auto-approve band</p>
                  <p className="text-[12px] text-muted-foreground">Low-friction operational spend</p>
                </div>
                <span className="badge badge-info">&lt; {fmt(autoApproveLimit)}</span>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-[rgba(255,255,255,0.02)] p-4">
              <div className="mb-2 flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">Runway health</span>
                <span className="font-medium text-foreground">{runwayLabel}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    runway < 6 ? "bg-destructive" : runway < 12 ? "bg-warning" : "bg-success"
                  }`}
                  style={{ width: `${Math.min((runway / 24) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
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

      {payments.length === 0 && (
        <div className="card p-6 animate-in-delay-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="section-title">Getting Started</h3>
              <p className="text-[12px] text-muted-foreground">Follow these steps to see the full treasury workflow</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Link href="/policies" className="metric-tile hover:border-primary/20 transition-colors">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-secondary text-[11px] font-semibold mb-2">1</div>
              <p className="text-[13px] font-medium">Set Policies</p>
              <p className="text-[11px] text-muted-foreground mt-1">Auto-approve limit, burn cap, dual approval threshold</p>
            </Link>
            <Link href="/invoices" className="metric-tile hover:border-primary/20 transition-colors">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-secondary text-[11px] font-semibold mb-2">2</div>
              <p className="text-[13px] font-medium">Upload Invoice</p>
              <p className="text-[11px] text-muted-foreground mt-1">AI parses vendor, amount, category from any PDF/image</p>
            </Link>
            <Link href="/approvals" className="metric-tile hover:border-primary/20 transition-colors">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-secondary text-[11px] font-semibold mb-2">3</div>
              <p className="text-[13px] font-medium">Approve & Execute</p>
              <p className="text-[11px] text-muted-foreground mt-1">Sign pending payments, execute approved ones</p>
            </Link>
            <Link href="/proofs" className="metric-tile hover:border-primary/20 transition-colors">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-secondary text-[11px] font-semibold mb-2">4</div>
              <p className="text-[13px] font-medium">Generate Proofs</p>
              <p className="text-[11px] text-muted-foreground mt-1">Selective disclosure for investors, auditors, regulators</p>
            </Link>
          </div>
        </div>
      )}

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
