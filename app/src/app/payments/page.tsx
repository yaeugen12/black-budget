"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { useCompany } from "@/lib/company-context";
import {
  type LucideIcon,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Ban,
  Loader2,
  Wallet,
  Shield,
} from "lucide-react";

const statusConfig: Record<
  string,
  { icon: LucideIcon; color: string; bg: string; label: string; helper: string }
> = {
  pending: {
    icon: Clock,
    color: "text-warning",
    bg: "badge-warning",
    label: "Pending",
    helper: "Waiting for required approvals",
  },
  approved: {
    icon: CheckCircle2,
    color: "text-success",
    bg: "badge-success",
    label: "Approved",
    helper: "Ready for on-chain execution",
  },
  executed: {
    icon: CheckCircle2,
    color: "text-success",
    bg: "badge-success",
    label: "Executed",
    helper: "Transferred from the treasury vault",
  },
  rejected: {
    icon: XCircle,
    color: "text-destructive",
    bg: "badge-danger",
    label: "Rejected",
    helper: "Stopped by an approver",
  },
  cancelled: {
    icon: Ban,
    color: "text-muted-foreground",
    bg: "badge-neutral",
    label: "Cancelled",
    helper: "No further action",
  },
};

function truncatePubkey(key: string): string {
  if (key.length <= 10) return key;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PaymentsPage() {
  const { payments, loading, executePayment, refresh } = useCompany();
  const [amountsVisible, setAmountsVisible] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [executing, setExecuting] = useState<string | null>(null);

  const rows = payments.map((payment) => {
    const account = payment.account;
    const status = Object.keys(account.status)[0].toLowerCase();
    const category = Object.keys(account.category)[0];
    return {
      publicKey: payment.publicKey.toBase58(),
      paymentId: account.paymentId.toNumber(),
      id: `BB-${String(account.paymentId.toNumber() + 1).padStart(3, "0")}`,
      recipient: truncatePubkey(account.recipient.toBase58()),
      recipientFull: account.recipient.toBase58(),
      amount: account.amount.toNumber() / 1_000_000,
      category: category.charAt(0).toUpperCase() + category.slice(1),
      status,
      memo: account.memo,
      createdAt: new Date(account.createdAt.toNumber() * 1000).toLocaleDateString(),
      riskScore: account.riskScore,
    };
  });

  const filtered = filter === "all" ? rows : rows.filter((payment) => payment.status === filter);
  const totalVolume = rows.reduce((sum, payment) => sum + payment.amount, 0);
  const pendingCount = rows.filter((payment) => payment.status === "pending").length;
  const approvedCount = rows.filter((payment) => payment.status === "approved").length;
  const executedCount = rows.filter((payment) => payment.status === "executed").length;

  const handleExecute = useCallback(
    async (paymentId: number, recipientPubkey: string, key: string) => {
      setExecuting(key);
      try {
        await executePayment(paymentId, recipientPubkey);
        await refresh();
      } finally {
        setExecuting(null);
      }
    },
    [executePayment, refresh]
  );

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell mx-auto max-w-6xl space-y-6 animate-in">
      <section className="card px-6 py-6 lg:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="eyebrow">
              <Wallet className="h-3.5 w-3.5" />
              Payments
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">
              Review and execute treasury payments
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted-foreground">
              Filter the queue by status, then execute the requests that are already approved.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setAmountsVisible(!amountsVisible)} className="btn-secondary px-4 py-2 text-[12px]">
              {amountsVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {amountsVisible ? "Hide values" : "Show values"}
            </button>
            <span className="badge badge-neutral">{rows.length} total</span>
            <span className="badge badge-warning">{pendingCount} pending</span>
            <span className="badge badge-success">{approvedCount} approved</span>
            <span className="badge badge-info">
              {amountsVisible ? formatCurrency(totalVolume) : "Hidden"} total
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {["all", "approved", "pending", "executed", "rejected"].map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={
                filter === value
                  ? "btn-primary px-4 py-2 text-[12px] capitalize"
                  : "btn-secondary px-4 py-2 text-[12px] capitalize"
              }
            >
              {value}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="metric-tile">
            <p className="text-label mb-1">Ready to execute</p>
            <p className="section-title">{approvedCount}</p>
          </div>
          <div className="metric-tile">
            <p className="text-label mb-1">Pending approvals</p>
            <p className="section-title">{pendingCount}</p>
          </div>
          <div className="metric-tile">
            <p className="text-label mb-1">Executed</p>
            <p className="section-title">{executedCount}</p>
          </div>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-secondary">
            <Shield className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-xl font-semibold tracking-tight">No payments in this view</h3>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Try another filter, or create a new invoice to push more treasury activity into the pipeline.
          </p>
          <Link href="/invoices" className="btn-primary mt-5 inline-flex">
            Open Invoice Intake
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((payment) => {
            const config = statusConfig[payment.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            const isExecuting = executing === payment.publicKey;

            return (
              <div key={payment.publicKey} className="card p-5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge badge-neutral text-mono">{payment.id}</span>
                      <span className={`badge ${config.bg}`}>
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </span>
                      <span className="badge badge-neutral">{payment.category}</span>
                      {payment.riskScore > 30 && <span className="badge badge-warning">Risk {payment.riskScore}/100</span>}
                    </div>

                    <div className="mt-4">
                      <p className="section-title font-mono">{payment.recipient}</p>
                      <p className="mt-1 text-[12px] text-muted-foreground">{config.helper}</p>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="metric-tile">
                        <p className="text-label mb-1">Created</p>
                        <p className="section-title">{payment.createdAt}</p>
                      </div>
                      <div className="metric-tile">
                        <p className="text-label mb-1">Amount</p>
                        <p className="section-title text-primary">
                          {amountsVisible ? formatCurrency(payment.amount) : "Hidden"}
                        </p>
                      </div>
                      <div className="metric-tile">
                        <p className="text-label mb-1">Risk Score</p>
                        <p className="section-title">{payment.riskScore}/100</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-border bg-secondary/40 px-4 py-3">
                      <p className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">Memo</p>
                      <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                        {payment.memo || "No memo attached to this payment request."}
                      </p>
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-3 lg:w-[220px]">
                    {payment.status === "approved" ? (
                      <button
                        disabled={isExecuting}
                        onClick={() => handleExecute(payment.paymentId, payment.recipientFull, payment.publicKey)}
                        className="btn-primary w-full"
                      >
                        {isExecuting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Executing...
                          </>
                        ) : (
                          <>
                            Execute On-Chain
                            <ExternalLink className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-4 text-[13px] leading-6 text-muted-foreground">
                        {payment.status === "pending"
                          ? "Needs signatures before it can move to execution."
                          : payment.status === "executed"
                            ? "Already settled from the treasury vault."
                            : "No direct action is needed from this screen."}
                      </div>
                    )}

                    <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-4">
                      <p className="text-label mb-2">Recipient</p>
                      <p className="text-[12px] font-mono text-muted-foreground break-all">{payment.recipientFull}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
