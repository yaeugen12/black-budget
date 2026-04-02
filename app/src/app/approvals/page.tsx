// @ts-nocheck
"use client";

import { useState } from "react";
import { useCompany } from "@/lib/company-context";
import { CheckCircle2, XCircle, AlertTriangle, User, ChevronDown, ChevronUp, Loader2, ExternalLink } from "lucide-react";

function truncatePubkey(key: string): string {
  if (key.length <= 10) return key;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default function ApprovalsPage() {
  const { payments, approvePayment, rejectPayment, executePayment, refresh, loading } = useCompany();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [processing, setProcessing] = useState<Record<string, "approving" | "rejecting" | "executing">>({});

  // Filter to pending and approved payments
  const actionablePayments = payments.filter((p) => {
    const status = Object.keys(p.account.status)[0].toLowerCase();
    return status === "pending" || status === "approved";
  });

  const handleApprove = async (paymentId: number, key: string) => {
    setProcessing((prev) => ({ ...prev, [key]: "approving" }));
    try {
      await approvePayment(paymentId);
    } catch (e) {
      // toast already handled in context
    } finally {
      setProcessing((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleReject = async (paymentId: number, key: string) => {
    setProcessing((prev) => ({ ...prev, [key]: "rejecting" }));
    try {
      await rejectPayment(paymentId);
    } catch (e) {
      // toast already handled in context
    } finally {
      setProcessing((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleExecute = async (paymentId: number, recipientPubkey: string, key: string) => {
    setProcessing((prev) => ({ ...prev, [key]: "executing" }));
    try {
      await executePayment(paymentId, recipientPubkey);
      await refresh();
    } catch (e) {
      // toast already handled in context
    } finally {
      setProcessing((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Approvals &amp; Execution</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {actionablePayments.length} payment{actionablePayments.length !== 1 ? "s" : ""} waiting for action
        </p>
      </div>

      {actionablePayments.length === 0 ? (
        <div className="glass rounded-xl p-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-[var(--success)] mx-auto mb-3" />
          <p className="text-muted-foreground">No pending actions</p>
          <p className="text-xs text-muted-foreground mt-1">All payments have been processed</p>
        </div>
      ) : (
        <div className="space-y-3">
          {actionablePayments.map((p) => {
            const acct = p.account;
            const key = p.publicKey.toBase58();
            const paymentId = acct.paymentId.toNumber();
            const displayId = `BB-${String(paymentId + 1).padStart(3, "0")}`;
            const amount = acct.amount.toNumber() / 1_000_000;
            const category = Object.keys(acct.category)[0];
            const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
            const riskScore = acct.riskScore;
            const memo = acct.memo;
            const requester = truncatePubkey(acct.requester.toBase58());
            const approvals = acct.approvals || [];
            const requiredApprovals = acct.requiredApprovals;
            const createdAt = new Date(acct.createdAt.toNumber() * 1000).toLocaleDateString();
            const isProcessing = processing[key];
            const status = Object.keys(acct.status)[0].toLowerCase();
            const recipientPubkey = acct.recipient.toBase58();

            return (
              <div key={key} className="glass rounded-xl overflow-hidden">
                {/* Header */}
                <div
                  className="flex items-center justify-between p-5 cursor-pointer hover:bg-secondary/30 transition-colors"
                  onClick={() => setExpanded(expanded === key ? null : key)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${
                      riskScore > 30 ? "bg-[var(--warning)]" : "bg-[var(--success)]"
                    } pulse-subtle`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium font-mono text-sm">{displayId}</span>
                        <span className="text-sm text-muted-foreground">to {truncatePubkey(acct.recipient.toBase58())}</span>
                        {status === "approved" && (
                          <span className="badge-success text-xs px-2 py-0.5 rounded">Approved</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {categoryLabel} · {createdAt} · by {requester}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-mono font-medium">${amount.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">
                        {approvals.length}/{requiredApprovals} approvals
                      </div>
                    </div>
                    {expanded === key ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {expanded === key && (
                  <div className="border-t border-border px-5 py-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">Payment ID</span>
                        <p className="font-mono">{displayId}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Risk Score</span>
                        <p className={`font-mono ${riskScore > 30 ? "text-[var(--warning)]" : "text-[var(--success)]"}`}>
                          {riskScore}/100
                        </p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-muted-foreground">Memo</span>
                        <p>{memo || "No memo"}</p>
                      </div>
                    </div>

                    {/* Approval Progress */}
                    <div>
                      <span className="text-xs text-muted-foreground">Approvals</span>
                      <div className="flex items-center gap-2 mt-2">
                        {Array.from({ length: requiredApprovals }).map((_, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
                              i < approvals.length
                                ? "badge-success"
                                : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            <User className="w-3 h-3" />
                            {i < approvals.length ? (
                              <span>Approved by {truncatePubkey(approvals[i].toBase58())}</span>
                            ) : (
                              <span>Waiting...</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {isProcessing ? (
                      <div className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-secondary text-muted-foreground text-sm font-medium">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {isProcessing === "approving" ? "Approving..." : isProcessing === "rejecting" ? "Rejecting..." : "Executing..."}
                      </div>
                    ) : status === "approved" ? (
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExecute(paymentId, recipientPubkey, key); }}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--success)]/20 text-[var(--success)] font-medium text-sm hover:bg-[var(--success)]/30 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" /> Execute Payment
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleApprove(paymentId, key); }}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--success)]/20 text-[var(--success)] font-medium text-sm hover:bg-[var(--success)]/30 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Approve
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReject(paymentId, key); }}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-destructive/20 text-destructive font-medium text-sm hover:bg-destructive/30 transition-colors"
                        >
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
