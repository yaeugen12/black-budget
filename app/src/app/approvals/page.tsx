"use client";

import { useState } from "react";
import { useCompany } from "@/lib/company-context";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User,
  ChevronDown,
  ChevronUp,
  Loader2,
  ExternalLink,
} from "lucide-react";

function truncatePubkey(key: string) {
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

export default function ApprovalsPage() {
  const { payments, approvePayment, rejectPayment, executePayment, refresh, loading } = useCompany();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [processing, setProcessing] = useState<Record<string, "approving" | "rejecting" | "executing">>({});

  const actionablePayments = payments.filter((payment) => {
    const status = Object.keys(payment.account.status)[0].toLowerCase();
    return status === "pending" || status === "approved";
  });
  const paymentsNeedingApproval = actionablePayments.filter(
    (payment) => Object.keys(payment.account.status)[0].toLowerCase() === "pending"
  );
  const paymentsReadyToExecute = actionablePayments.filter(
    (payment) => Object.keys(payment.account.status)[0].toLowerCase() === "approved"
  );

  const awaitingSigners = paymentsNeedingApproval.length;
  const readyToExecute = paymentsReadyToExecute.length;
  const queueValue = actionablePayments.reduce(
    (sum, payment) => sum + payment.account.amount.toNumber() / 1_000_000,
    0
  );

  const clearProcessing = (key: string) => {
    setProcessing((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleApprove = async (paymentId: number, key: string) => {
    setProcessing((prev) => ({ ...prev, [key]: "approving" }));
    try {
      await approvePayment(paymentId);
      await refresh();
    } finally {
      clearProcessing(key);
    }
  };

  const handleReject = async (paymentId: number, key: string) => {
    setProcessing((prev) => ({ ...prev, [key]: "rejecting" }));
    try {
      await rejectPayment(paymentId);
      await refresh();
    } finally {
      clearProcessing(key);
    }
  };

  const handleExecute = async (paymentId: number, recipientPubkey: string, key: string) => {
    setProcessing((prev) => ({ ...prev, [key]: "executing" }));
    try {
      await executePayment(paymentId, recipientPubkey);
      await refresh();
    } finally {
      clearProcessing(key);
    }
  };

  const renderPaymentCard = (payment: (typeof actionablePayments)[number]) => {
    const account = payment.account;
    const key = payment.publicKey.toBase58();
    const paymentId = account.paymentId.toNumber();
    const displayId = `BB-${String(paymentId + 1).padStart(3, "0")}`;
    const amount = account.amount.toNumber() / 1_000_000;
    const category = Object.keys(account.category)[0];
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
    const riskScore = account.riskScore;
    const memo = account.memo;
    const requester = truncatePubkey(account.requester.toBase58());
    const approvals = account.approvals || [];
    const requiredApprovals = account.requiredApprovals;
    const createdAt = new Date(account.createdAt.toNumber() * 1000).toLocaleDateString();
    const isProcessing = processing[key];
    const status = Object.keys(account.status)[0].toLowerCase();
    const recipientPubkey = account.recipient.toBase58();
    const progress = requiredApprovals > 0 ? (approvals.length / requiredApprovals) * 100 : 100;

    return (
      <div key={key} className="card overflow-hidden">
        <div
          className="flex cursor-pointer flex-col gap-5 px-5 py-5 transition-colors hover:bg-[rgba(255,255,255,0.015)] lg:flex-row lg:items-start lg:justify-between"
          onClick={() => setExpanded(expanded === key ? null : key)}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-neutral text-mono">{displayId}</span>
              <span className={`badge ${status === "approved" ? "badge-success" : "badge-warning"}`}>
                {status === "approved" ? "Approved" : "Pending"}
              </span>
              <span className="badge badge-neutral">{categoryLabel}</span>
              {riskScore > 30 && <span className="badge badge-warning">Risk {riskScore}/100</span>}
            </div>

            <div className="mt-4">
              <p className="section-title">Transfer to {truncatePubkey(account.recipient.toBase58())}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Requested by {requester} on {createdAt}
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="metric-tile">
                <p className="text-label mb-1">Amount</p>
                <p className="section-title text-primary">{formatCurrency(amount)}</p>
              </div>
              <div className="metric-tile">
                <p className="text-label mb-1">Approvals</p>
                <p className="section-title">
                  {approvals.length}/{requiredApprovals}
                </p>
              </div>
              <div className="metric-tile">
                <p className="text-label mb-1">Risk Score</p>
                <p className="section-title">{riskScore}/100</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 lg:pl-4">
            <div className="text-right">
              <p className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">Progress</p>
              <p className="mt-1 text-[13px] font-medium text-foreground">
                {status === "approved" ? "Ready to execute" : "Waiting on signers"}
              </p>
            </div>
            {expanded === key ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {expanded === key && (
          <div className="border-t border-border bg-[rgba(255,255,255,0.015)] px-5 py-5">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[13px] font-medium">Approval progress</p>
                    <p className="text-[12px] text-muted-foreground">
                      {approvals.length}/{requiredApprovals} complete
                    </p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${status === "approved" ? "bg-success" : "bg-warning"}`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>

                  <div className="mt-4 space-y-2">
                    {Array.from({ length: requiredApprovals }).map((_, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] ${
                          index < approvals.length ? "badge-success" : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        <User className="h-3.5 w-3.5" />
                        {index < approvals.length ? (
                          <span>Approved by {truncatePubkey(approvals[index].toBase58())}</span>
                        ) : (
                          <span>Waiting for signer {index + 1}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-4">
                  <p className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">Memo</p>
                  <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                    {memo || "No memo attached to this payment request."}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="metric-tile">
                    <p className="text-label mb-1">Recipient</p>
                    <p className="section-title font-mono text-[13px] break-all">{recipientPubkey}</p>
                  </div>
                  <div className="metric-tile">
                    <p className="text-label mb-1">Requester</p>
                    <p className="section-title font-mono text-[13px]">{requester}</p>
                  </div>
                </div>

                {isProcessing ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-secondary/40 px-4 py-4 text-[13px] font-medium text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isProcessing === "approving"
                      ? "Approving..."
                      : isProcessing === "rejecting"
                        ? "Rejecting..."
                        : "Executing..."}
                  </div>
                ) : status === "approved" ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExecute(paymentId, recipientPubkey, key);
                    }}
                    className="btn-primary w-full"
                  >
                    Execute Payment
                    <ExternalLink className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApprove(paymentId, key);
                      }}
                      className="btn-primary w-full"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReject(paymentId, key);
                      }}
                      className="btn-secondary w-full text-destructive hover:text-destructive"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                )}

                <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-4 text-[13px] leading-6 text-muted-foreground">
                  {riskScore > 30 ? (
                    <div className="flex items-start gap-2 text-amber-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Higher-risk request. Review the memo and recipient wallet before signing.</span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-emerald-300">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Low-friction request based on current risk scoring and approval state.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-shell mx-auto max-w-6xl space-y-6 animate-in">
      <section className="card px-6 py-6 lg:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="eyebrow">Approvals</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">Take the next treasury action</h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted-foreground">
              Requests that still need signatures stay separate from requests that are already ready to execute.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="badge badge-neutral">{actionablePayments.length} actionable</span>
            <span className="badge badge-warning">{awaitingSigners} awaiting signers</span>
            <span className="badge badge-success">{readyToExecute} ready to execute</span>
            <span className="badge badge-info">{formatCurrency(queueValue)} in queue</span>
          </div>
        </div>
      </section>

      {actionablePayments.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-success/10">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
          <h3 className="mt-4 text-xl font-semibold tracking-tight">Nothing is waiting on treasury action</h3>
          <p className="mt-2 text-[14px] text-muted-foreground">
            All payment requests are either completed or absent. New approval work will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {paymentsReadyToExecute.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="section-title">Ready to execute</h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">Already approved. These are the fastest actions in the queue.</p>
                </div>
                <span className="badge badge-success">{paymentsReadyToExecute.length}</span>
              </div>
              <div className="space-y-4">
                {paymentsReadyToExecute.map(renderPaymentCard)}
              </div>
            </section>
          )}

          {paymentsNeedingApproval.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="section-title">Waiting for approvals</h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">Sign or reject these before they can move to execution.</p>
                </div>
                <span className="badge badge-warning">{paymentsNeedingApproval.length}</span>
              </div>
              <div className="space-y-4">
                {paymentsNeedingApproval.map(renderPaymentCard)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
