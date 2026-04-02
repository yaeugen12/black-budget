"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";

interface Payment {
  id: string;
  vendor: string;
  amount: number;
  category: string;
  status: "executed" | "pending" | "rejected";
  approvals: string[];
  requiredApprovals: number;
  createdAt: string;
  executedAt?: string;
  txHash?: string;
  confidential: boolean;
}

const payments: Payment[] = [
  { id: "BB-023", vendor: "Acme Design Co.", amount: 3200, category: "Contractor", status: "executed", approvals: [], requiredApprovals: 0, createdAt: "2026-03-28", executedAt: "2026-03-28", txHash: "5Kx7...mN2f", confidential: true },
  { id: "BB-024", vendor: "AWS Infrastructure", amount: 12800, category: "Subscription", status: "pending", approvals: ["3Bf2...mN8k"], requiredApprovals: 2, createdAt: "2026-03-28", confidential: false },
  { id: "BB-022", vendor: "March Payroll Batch", amount: 28500, category: "Payroll", status: "executed", approvals: ["7Ke4...x9Fm", "3Bf2...mN8k"], requiredApprovals: 2, createdAt: "2026-03-25", executedAt: "2026-03-25", txHash: "9Ht3...pL5w", confidential: true },
  { id: "BB-025", vendor: "Legal Advisory LLC", amount: 7500, category: "Vendor", status: "pending", approvals: [], requiredApprovals: 1, createdAt: "2026-03-27", confidential: false },
  { id: "BB-021", vendor: "Figma Pro", amount: 45, category: "Subscription", status: "executed", approvals: [], requiredApprovals: 0, createdAt: "2026-03-22", executedAt: "2026-03-22", txHash: "2Wm8...bQ4k", confidential: true },
  { id: "BB-020", vendor: "Sprint 11 Backend", amount: 4800, category: "Contractor", status: "executed", approvals: ["3Bf2...mN8k"], requiredApprovals: 1, createdAt: "2026-03-18", executedAt: "2026-03-18", txHash: "7Nj5...xR1v", confidential: true },
  { id: "BB-019", vendor: "Office Rent (co-working)", amount: 2100, category: "Vendor", status: "rejected", approvals: [], requiredApprovals: 1, createdAt: "2026-03-15", confidential: false },
  { id: "BB-018", vendor: "Vercel Pro", amount: 320, category: "Subscription", status: "executed", approvals: [], requiredApprovals: 0, createdAt: "2026-03-12", executedAt: "2026-03-12", txHash: "4Gp2...sM9e", confidential: true },
];

const statusConfig = {
  executed: { icon: CheckCircle2, color: "text-[var(--success)]", bg: "badge-success", label: "Executed" },
  pending: { icon: Clock, color: "text-[var(--warning)]", bg: "badge-warning", label: "Pending" },
  rejected: { icon: XCircle, color: "text-destructive", bg: "badge-danger", label: "Rejected" },
};

export default function PaymentsPage() {
  const [amountsVisible, setAmountsVisible] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const filtered = filter === "all" ? payments : payments.filter((p) => p.status === filter);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {payments.length} total payments · {payments.filter((p) => p.confidential).length} confidential transfers
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
        {["all", "executed", "pending", "rejected"].map((f) => (
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
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
              <th className="px-5 py-3">ID</th>
              <th className="px-5 py-3">Vendor</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3 text-right">Amount</th>
              <th className="px-5 py-3 text-right">TX</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((payment) => {
              const config = statusConfig[payment.status];
              const StatusIcon = config.icon;
              return (
                <tr key={payment.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-4 font-mono text-xs">{payment.id}</td>
                  <td className="px-5 py-4 text-sm font-medium">{payment.vendor}</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{payment.category}</td>
                  <td className="px-5 py-4">
                    <span className={`${config.bg} text-xs px-2 py-1 rounded flex items-center gap-1 w-fit`}>
                      <StatusIcon className="w-3 h-3" />
                      {config.label}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{payment.createdAt}</td>
                  <td className="px-5 py-4 text-right font-mono text-sm">
                    {amountsVisible ? `$${payment.amount.toLocaleString()}` : "•••••"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {payment.txHash ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary font-mono cursor-pointer hover:underline">
                        {payment.confidential && <Eye className="w-3 h-3" />}
                        {payment.txHash}
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
