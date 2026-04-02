"use client";

import {
  ArrowUpRight,
  Eye,
  EyeOff,
  Users,
  FileText,
  Shield,
  AlertTriangle,
  ExternalLink,
  Plus,
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
    } catch {} finally { setDepositing(false); }
  };

  const fmt = (n: number) => balanceVisible ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}` : "--------";

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading">{company?.name || "Dashboard"}</h1>
          {companyPDA && (
            <div className="flex items-center gap-3 mt-0.5">
              <a
                href={`https://explorer.solana.com/address/${companyPDA.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary transition-colors text-mono"
              >
                {companyPDA.toBase58().slice(0, 12)}...{companyPDA.toBase58().slice(-4)}
                <ExternalLink className="w-3 h-3" />
              </a>
              <ConfidentialBadge />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBalanceVisible(!balanceVisible)}
            className="btn-ghost"
          >
            {balanceVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button onClick={() => setShowDeposit(!showDeposit)} className="btn-secondary text-[13px] py-2 px-4">
            <ArrowUpRight className="w-4 h-4" /> Deposit
          </button>
          <Link href="/invoices" className="btn-primary text-[13px] py-2 px-4">
            <Plus className="w-4 h-4" /> New Payment
          </Link>
        </div>
      </div>

      {/* Deposit USDC */}
      {showDeposit && (
        <div className="card p-4 flex items-center gap-3 animate-in">
          <input
            type="number"
            placeholder="Amount (USDC)"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="input flex-1 max-w-[200px]"
            min="1"
          />
          <button
            onClick={handleDeposit}
            disabled={depositing || !depositAmount}
            className="btn-primary text-[13px] py-2 px-4"
          >
            {depositing ? "Sending..." : "Deposit to Vault"}
          </button>
          <button onClick={() => setShowDeposit(false)} className="btn-ghost text-[13px]">Cancel</button>
        </div>
      )}

      {/* Alerts */}
      {pendingPayments.length > 0 && (
        <Link href="/approvals" className="card flex items-center gap-3 px-4 py-3 hover:border-warning/30 transition-colors animate-in-delay-1">
          <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium">{pendingPayments.length} payment{pendingPayments.length > 1 ? "s" : ""} awaiting approval</p>
            <p className="text-[12px] text-muted-foreground">Click to review and approve</p>
          </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
        </Link>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Balance */}
        <div className="card-highlight p-5 animate-in-delay-1">
          <div className="text-label mb-3">Treasury Balance</div>
          <div className="stat-value">{fmt(vaultBalance)}</div>
          <div className="flex items-center gap-1.5 mt-2">
            <div className="badge badge-success">
              <ArrowUpRight className="w-3 h-3" /> USDC
            </div>
          </div>
        </div>

        {/* Monthly Spend */}
        <div className="card p-5 animate-in-delay-2">
          <div className="text-label mb-3">Total Spent</div>
          <div className="stat-value">{fmt(totalSpent)}</div>
          <div className="text-[12px] text-muted-foreground mt-2">
            {paymentCount} payment{paymentCount !== 1 ? "s" : ""} executed
          </div>
        </div>

        {/* Runway */}
        <div className="card p-5 animate-in-delay-3">
          <div className="text-label mb-3">Runway</div>
          <div className="stat-value">
            {monthlySpent === 0 ? (
              <span className="text-muted-foreground">N/A</span>
            ) : runway > 50 ? (
              <span className="text-success">Safe</span>
            ) : (
              <>{runway.toFixed(1)}<span className="text-base font-normal text-muted-foreground ml-1">mo</span></>
            )}
          </div>
          <div className="mt-3">
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  runway < 6 ? "bg-destructive" : runway < 12 ? "bg-warning" : "bg-success"
                }`}
                style={{ width: `${Math.min((runway / 24) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Pending */}
        <div className="card p-5 animate-in-delay-4">
          <div className="text-label mb-3">Active</div>
          <div className="flex items-baseline gap-4">
            <div>
              <span className="stat-value text-warning">{pendingPayments.length}</span>
              <span className="text-[12px] text-muted-foreground ml-1">pending</span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" /> {memberCount}
            </span>
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3" /> Auto &lt;{fmt(autoApproveLimit)}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Payments */}
      <div className="card animate-in-delay-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-[13px] font-semibold">Recent Activity</h3>
          <Link href="/payments" className="btn-ghost text-[12px] py-1 px-2">
            View all
          </Link>
        </div>

        {payments.length === 0 ? (
          <div className="text-center py-12 px-5">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-3">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-[13px] font-medium">No payments yet</p>
            <p className="text-[12px] text-muted-foreground mt-1">Upload an invoice to create your first payment</p>
            <Link href="/invoices" className="btn-primary text-[13px] mt-4 py-2 px-4 inline-flex">
              <Plus className="w-4 h-4" /> New Payment
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {payments.slice(0, 6).map((payment, i) => {
              const status = payment.account.status;
              const isPending = status.pending !== undefined;
              const isExecuted = status.executed !== undefined;
              const isRejected = status.rejected !== undefined;

              return (
                <div
                  key={payment.publicKey.toBase58()}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-[rgba(255,255,255,0.015)] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      isExecuted ? "bg-success" : isPending ? "bg-warning pulse-dot" : "bg-destructive"
                    }`} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate">
                        Payment #{payment.account.paymentId.toNumber()}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {payment.account.memo || "No memo"} · {payment.account.approvals.length}/{payment.account.requiredApprovals} approvals
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-[13px] text-mono font-medium">
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
