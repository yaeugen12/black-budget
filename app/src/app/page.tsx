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
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { useCompany } from "@/lib/company-context";

export default function Dashboard() {
  const { company, companyPDA, payments } = useCompany();
  const [balanceVisible, setBalanceVisible] = useState(true);

  // Derive stats from on-chain data
  const totalSpent = company ? company.totalSpent.toNumber() / 1_000_000 : 0;
  const monthlySpent = company ? company.monthlySpent.toNumber() / 1_000_000 : 0;
  const autoApproveLimit = company ? company.policy.autoApproveLimit.toNumber() / 1_000_000 : 5000;
  const memberCount = company ? company.memberCount : 1;
  const paymentCount = company ? company.paymentNonce.toNumber() : 0;

  const pendingPayments = payments.filter(
    (p) => p.account.status.pending !== undefined
  );
  const executedPayments = payments.filter(
    (p) => p.account.status.executed !== undefined
  );

  // Mock balance (in production: read vault token account)
  const vaultBalance = 284_750 - totalSpent;
  const runway = monthlySpent > 0 ? vaultBalance / monthlySpent : 99;

  const policyAlerts = [];
  if (company && company.policy.minRunwayMonths > 0 && runway < company.policy.minRunwayMonths) {
    policyAlerts.push({
      type: "warning",
      message: `Runway below ${company.policy.minRunwayMonths} months — discretionary spend monitoring active`,
    });
  }
  if (pendingPayments.length > 0) {
    policyAlerts.push({
      type: "info",
      message: `${pendingPayments.length} payment(s) awaiting approval`,
    });
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {company?.name || "Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {companyPDA ? (
              <a
                href={`https://explorer.solana.com/address/${companyPDA.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                {companyPDA.toBase58().slice(0, 16)}...
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              "Financial overview"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="w-3.5 h-3.5 text-primary" />
          <span>On-chain · Devnet</span>
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
            {balanceVisible ? `$${vaultBalance.toLocaleString()}` : "••••••••"}
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm text-[var(--success)]">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>USDC vault on Solana</span>
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Spent</span>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold font-mono">
            {balanceVisible ? `$${totalSpent.toLocaleString()}` : "••••••"}
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
            <span>{paymentCount} payments executed</span>
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Runway</span>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold font-mono">
            {runway > 50 ? "∞" : runway.toFixed(1)} <span className="text-lg text-muted-foreground">months</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 mt-3">
            <div
              className={`rounded-full h-2 transition-all ${runway < 6 ? "bg-[var(--destructive)]" : runway < 12 ? "bg-[var(--warning)]" : "bg-[var(--success)]"}`}
              style={{ width: `${Math.min((runway / 24) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Pending</span>
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold font-mono text-[var(--warning)]">
            {pendingPayments.length}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" /> {memberCount} member{memberCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" /> Auto-approve &lt; ${autoApproveLimit.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Recent On-chain Payments */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">On-Chain Payments</h3>
          <a href="/payments" className="text-xs text-primary hover:underline">View all</a>
        </div>

        {payments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No payments yet</p>
            <p className="text-xs mt-1">Upload an invoice to create your first payment</p>
          </div>
        ) : (
          <div className="space-y-1">
            {payments.slice(0, 5).map((payment) => {
              const status = payment.account.status;
              const isPending = status.pending !== undefined;
              const isExecuted = status.executed !== undefined;
              const isRejected = status.rejected !== undefined;

              return (
                <div
                  key={payment.publicKey.toBase58()}
                  className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        isExecuted ? "bg-[var(--success)]" : isPending ? "bg-[var(--warning)] pulse-subtle" : "bg-[var(--destructive)]"
                      }`}
                    />
                    <div>
                      <div className="text-sm font-medium font-mono">
                        Payment #{payment.account.paymentId.toNumber()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {payment.account.memo || "No memo"} · {payment.account.approvals.length}/{payment.account.requiredApprovals} approvals
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono">
                      {balanceVisible
                        ? `$${(payment.account.amount.toNumber() / 1_000_000).toLocaleString()}`
                        : "•••••"}
                    </div>
                    <div className="text-xs">
                      {isExecuted && <span className="text-[var(--success)]">Executed</span>}
                      {isPending && <span className="text-[var(--warning)]">Pending</span>}
                      {isRejected && <span className="text-destructive">Rejected</span>}
                    </div>
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
