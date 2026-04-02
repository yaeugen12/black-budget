"use client";

import {
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  EyeOff,
  TrendingUp,
  Users,
  FileText,
  Clock,
  Shield,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";

const stats = {
  balance: 284_750.00,
  monthlySpend: 47_200.00,
  runway: 6.0,
  pendingApprovals: 3,
  membersActive: 8,
  paymentsThisMonth: 23,
};

const recentPayments = [
  { id: 1, vendor: "Acme Design Co.", amount: 3200, category: "Contractor", status: "executed", time: "2h ago" },
  { id: 2, vendor: "AWS Infrastructure", amount: 12800, category: "Subscription", status: "pending", approvals: "1/2", time: "4h ago" },
  { id: 3, vendor: "March Payroll Batch", amount: 28500, category: "Payroll", status: "executed", time: "1d ago" },
  { id: 4, vendor: "Legal Advisory LLC", amount: 7500, category: "Vendor", status: "pending", approvals: "0/1", time: "1d ago" },
  { id: 5, vendor: "Figma Pro", amount: 45, category: "Subscription", status: "executed", time: "3d ago" },
];

const policyAlerts = [
  { type: "warning", message: "Runway below 8 months — discretionary spend monitoring active" },
  { type: "info", message: "New vendor 'Legal Advisory LLC' pending verification" },
];

export default function Dashboard() {
  const [balanceVisible, setBalanceVisible] = useState(true);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Financial overview — only visible to authorized members
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="w-3.5 h-3.5 text-primary" />
          <span>Confidential mode active</span>
        </div>
      </div>

      {/* Policy Alerts */}
      {policyAlerts.map((alert, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${
            alert.type === "warning" ? "badge-warning" : "badge-info"
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {alert.message}
        </div>
      ))}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Balance */}
        <div className="glass rounded-xl p-5 glow-purple">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Treasury Balance</span>
            <button
              onClick={() => setBalanceVisible(!balanceVisible)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {balanceVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
          <div className="text-3xl font-bold font-mono">
            {balanceVisible ? `$${stats.balance.toLocaleString()}` : "••••••••"}
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm text-success">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+$12,400 this month</span>
          </div>
        </div>

        {/* Monthly Spend */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Monthly Spend</span>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold font-mono">
            {balanceVisible ? `$${stats.monthlySpend.toLocaleString()}` : "••••••"}
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm text-destructive">
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>+8% vs last month</span>
          </div>
        </div>

        {/* Runway */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Runway</span>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold font-mono">
            {stats.runway} <span className="text-lg text-muted-foreground">months</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 mt-3">
            <div
              className="bg-warning rounded-full h-2 transition-all"
              style={{ width: `${Math.min((stats.runway / 12) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Pending */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Pending Approvals</span>
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold font-mono text-warning">
            {stats.pendingApprovals}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" /> {stats.membersActive} members
            </span>
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" /> {stats.paymentsThisMonth} payments
            </span>
          </div>
        </div>
      </div>

      {/* Spend Breakdown + Recent Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Spend Breakdown */}
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-medium mb-4">Spend Breakdown</h3>
          <div className="space-y-3">
            {[
              { name: "Payroll", amount: 28500, pct: 60, color: "bg-[var(--primary)]" },
              { name: "Vendors", amount: 10700, pct: 23, color: "bg-blue-500" },
              { name: "Subscriptions", amount: 5200, pct: 11, color: "bg-emerald-500" },
              { name: "Other", amount: 2800, pct: 6, color: "bg-zinc-500" },
            ].map((item) => (
              <div key={item.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-mono">
                    {balanceVisible ? `$${item.amount.toLocaleString()}` : "•••"}
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-1.5">
                  <div
                    className={`${item.color} rounded-full h-1.5 transition-all`}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="lg:col-span-2 glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Recent Activity</h3>
            <a href="/payments" className="text-xs text-primary hover:underline">
              View all
            </a>
          </div>
          <div className="space-y-1">
            {recentPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      payment.status === "executed" ? "bg-[var(--success)]" : "bg-[var(--warning)] pulse-subtle"
                    }`}
                  />
                  <div>
                    <div className="text-sm font-medium">{payment.vendor}</div>
                    <div className="text-xs text-muted-foreground">
                      {payment.category} · {payment.time}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono">
                    {balanceVisible ? `-$${payment.amount.toLocaleString()}` : "•••••"}
                  </div>
                  <div className="text-xs">
                    {payment.status === "executed" ? (
                      <span className="text-[var(--success)]">Executed</span>
                    ) : (
                      <span className="text-[var(--warning)]">Pending ({payment.approvals})</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
