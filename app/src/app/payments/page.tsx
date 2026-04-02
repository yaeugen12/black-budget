// @ts-nocheck
"use client";

import { useState, useCallback } from "react";
import { useCompany } from "@/lib/company-context";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Ban,
  Loader2,
} from "lucide-react";

const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  pending:   { icon: Clock,        color: "text-[var(--warning)]",  bg: "badge-warning", label: "Pending" },
  approved:  { icon: CheckCircle2, color: "text-[var(--success)]",  bg: "badge-success", label: "Approved" },
  executed:  { icon: CheckCircle2, color: "text-[var(--success)]",  bg: "badge-success", label: "Executed" },
  rejected:  { icon: XCircle,      color: "text-destructive",       bg: "badge-danger",  label: "Rejected" },
  cancelled: { icon: Ban,          color: "text-muted-foreground",  bg: "bg-secondary",  label: "Cancelled" },
};

function truncatePubkey(key: string): string {
  if (key.length <= 10) return key;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default function PaymentsPage() {
  const { payments, loading, executePayment, refresh } = useCompany();
  const [amountsVisible, setAmountsVisible] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [executing, setExecuting] = useState<string | null>(null);

  const rows = payments.map((p) => {
    const acct = p.account;
    const status = Object.keys(acct.status)[0].toLowerCase();
    const category = Object.keys(acct.category)[0];
    return {
      publicKey: p.publicKey.toBase58(),
      paymentId: acct.paymentId.toNumber(),
      id: `BB-${String(acct.paymentId.toNumber() + 1).padStart(3, "0")}`,
      recipient: truncatePubkey(acct.recipient.toBase58()),
      recipientFull: acct.recipient.toBase58(),
      amount: acct.amount.toNumber() / 1_000_000,
      category: category.charAt(0).toUpperCase() + category.slice(1),
      status,
      memo: acct.memo,
      createdAt: new Date(acct.createdAt.toNumber() * 1000).toLocaleDateString(),
      riskScore: acct.riskScore,
    };
  });

  const filtered = filter === "all" ? rows : rows.filter((p) => p.status === filter);

  const handleExecute = useCallback(async (paymentId: number, recipientPubkey: string, key: string) => {
    setExecuting(key);
    try {
      await executePayment(paymentId, recipientPubkey);
      await refresh();
    } catch (e) {
      // toast already handled in context
    } finally {
      setExecuting(null);
    }
  }, [executePayment, refresh]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length} total payments
          </p>
        </div>
        <button
          onClick={() => setAmountsVisible(!amountsVisible)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg bg-secondary"
        >
          {amountsVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {amountsVisible ? "Hide amounts" : "Show amounts"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {["all", "executed", "approved", "pending", "rejected"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Payment List */}
      {filtered.length === 0 ? (
        <div className="glass rounded-xl p-10 text-center">
          <p className="text-muted-foreground">No payments found</p>
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                <th className="px-5 py-3">ID</th>
                <th className="px-5 py-3">Recipient</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((payment) => {
                const config = statusConfig[payment.status] || statusConfig.pending;
                const StatusIcon = config.icon;
                return (
                  <tr key={payment.publicKey} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-4 font-mono text-xs">{payment.id}</td>
                    <td className="px-5 py-4 text-sm font-mono text-muted-foreground">{payment.recipient}</td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{payment.category}</td>
                    <td className="px-5 py-4">
                      <span className={`${config.bg} text-xs px-2 py-1 rounded flex items-center gap-1 w-fit`}>
                        <StatusIcon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{payment.createdAt}</td>
                    <td className="px-5 py-4 text-right font-mono text-sm">
                      {amountsVisible ? `$${payment.amount.toLocaleString()}` : "-----"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {payment.status === "approved" && (
                        <button
                          disabled={executing === payment.publicKey}
                          onClick={() => handleExecute(payment.paymentId, payment.recipientFull, payment.publicKey)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--success)]/20 text-[var(--success)] hover:bg-[var(--success)]/30 transition-colors disabled:opacity-50"
                        >
                          {executing === payment.publicKey ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Executing...</>
                          ) : (
                            <><ExternalLink className="w-3 h-3" /> Execute</>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
