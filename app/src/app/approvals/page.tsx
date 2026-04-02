"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Clock, AlertTriangle, User, ChevronDown, ChevronUp } from "lucide-react";

interface PendingPayment {
  id: string;
  vendor: string;
  amount: number;
  category: string;
  memo: string;
  requester: string;
  requesterRole: string;
  riskScore: number;
  approvals: string[];
  requiredApprovals: number;
  createdAt: string;
  riskFlags: string[];
}

const pendingPayments: PendingPayment[] = [
  {
    id: "BB-024",
    vendor: "AWS Infrastructure",
    amount: 12800,
    category: "Subscription",
    memo: "Q2 cloud infrastructure — 3 months prepaid",
    requester: "0x4a2f...8b3c",
    requesterRole: "CTO",
    riskScore: 15,
    approvals: ["0x7e1d...3f2a"],
    requiredApprovals: 2,
    createdAt: "4 hours ago",
    riskFlags: [],
  },
  {
    id: "BB-025",
    vendor: "Legal Advisory LLC",
    amount: 7500,
    category: "Vendor",
    memo: "Token opinion letter + regulatory review",
    requester: "0x4a2f...8b3c",
    requesterRole: "Founder",
    riskScore: 45,
    approvals: [],
    requiredApprovals: 1,
    createdAt: "1 day ago",
    riskFlags: ["new_vendor"],
  },
  {
    id: "BB-026",
    vendor: "Contract Dev — Backend",
    amount: 4800,
    category: "Contractor",
    memo: "Sprint 12 backend development",
    requester: "0x9c3b...7d1e",
    requesterRole: "Lead Dev",
    riskScore: 5,
    approvals: [],
    requiredApprovals: 1,
    createdAt: "2 days ago",
    riskFlags: [],
  },
];

export default function ApprovalsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actioned, setActioned] = useState<Record<string, "approved" | "rejected">>({});

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pending Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {pendingPayments.length} payments waiting for your approval
        </p>
      </div>

      <div className="space-y-3">
        {pendingPayments.map((payment) => (
          <div key={payment.id} className="glass rounded-xl overflow-hidden">
            {/* Header */}
            <div
              className="flex items-center justify-between p-5 cursor-pointer hover:bg-secondary/30 transition-colors"
              onClick={() => setExpanded(expanded === payment.id ? null : payment.id)}
            >
              <div className="flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full ${
                  payment.riskScore > 30 ? "bg-[var(--warning)]" : "bg-[var(--success)]"
                } pulse-subtle`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{payment.vendor}</span>
                    {payment.riskFlags.includes("new_vendor") && (
                      <span className="badge-warning text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> New vendor
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {payment.category} · {payment.createdAt} · by {payment.requesterRole}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-mono font-medium">${payment.amount.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    {payment.approvals.length}/{payment.requiredApprovals} approvals
                  </div>
                </div>
                {expanded === payment.id ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Expanded Details */}
            {expanded === payment.id && (
              <div className="border-t border-border px-5 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Payment ID</span>
                    <p className="font-mono">{payment.id}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Risk Score</span>
                    <p className={`font-mono ${payment.riskScore > 30 ? "text-[var(--warning)]" : "text-[var(--success)]"}`}>
                      {payment.riskScore}/100
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">Memo</span>
                    <p>{payment.memo}</p>
                  </div>
                </div>

                {/* Approval Progress */}
                <div>
                  <span className="text-xs text-muted-foreground">Approvals</span>
                  <div className="flex items-center gap-2 mt-2">
                    {Array.from({ length: payment.requiredApprovals }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
                          i < payment.approvals.length
                            ? "badge-success"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        <User className="w-3 h-3" />
                        {i < payment.approvals.length ? (
                          <span>Approved by {payment.approvals[i].slice(0, 8)}...</span>
                        ) : (
                          <span>Waiting...</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                {!actioned[payment.id] ? (
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => setActioned({ ...actioned, [payment.id]: "approved" })}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--success)]/20 text-[var(--success)] font-medium text-sm hover:bg-[var(--success)]/30 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </button>
                    <button
                      onClick={() => setActioned({ ...actioned, [payment.id]: "rejected" })}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-destructive/20 text-destructive font-medium text-sm hover:bg-destructive/30 transition-colors"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                ) : (
                  <div className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium ${
                    actioned[payment.id] === "approved" ? "badge-success" : "badge-danger"
                  }`}>
                    {actioned[payment.id] === "approved" ? (
                      <><CheckCircle2 className="w-4 h-4" /> Approved — TX submitted</>
                    ) : (
                      <><XCircle className="w-4 h-4" /> Rejected</>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
