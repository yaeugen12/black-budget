"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/lib/company-context";
import { useWallet } from "@solana/wallet-adapter-react";
import { computeMerkleRoot, pseudonymize, abbreviateHash, type MerkleLeaf } from "@/lib/merkle";
import {
  Eye, EyeOff, Shield, Download, Copy, CheckCircle2,
  Lock, Unlock, BarChart3, FileText, Hash, Loader2, AlertTriangle, Anchor,
} from "lucide-react";

type ProofView = "investor" | "auditor" | "regulator" | null;

export default function ProofsPage() {
  const { company, companyPDA, vaultBalance, payments, anchorProof } = useCompany();
  const wallet = useWallet();
  const [activeView, setActiveView] = useState<ProofView>(null);
  const [copied, setCopied] = useState(false);
  const [merkleRoot, setMerkleRoot] = useState<string>("");
  const [leafCount, setLeafCount] = useState(0);
  const [computing, setComputing] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const [anchoredTx, setAnchoredTx] = useState<string | null>(null);
  const [auditorRows, setAuditorRows] = useState<{ id: string; vendor: string; amount: number; category: string; date: string }[]>([]);

  // Derive real data from on-chain payments
  const totalSpent = company ? company.totalSpent.toNumber() / 1_000_000 : 0;
  const monthlySpent = company ? company.monthlySpent.toNumber() / 1_000_000 : 0;
  const memberCount = company ? company.memberCount : 0;
  const runway = monthlySpent > 0 ? vaultBalance / monthlySpent : 0;

  // Category breakdown from real payments
  const categoryBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    let total = 0;
    for (const p of payments) {
      const cat = Object.keys(p.account.category)[0] || "other";
      const amount = p.account.amount.toNumber() / 1_000_000;
      breakdown[cat] = (breakdown[cat] || 0) + amount;
      total += amount;
    }
    // Convert to percentages
    const pcts: Record<string, string> = {};
    for (const [cat, val] of Object.entries(breakdown)) {
      pcts[cat] = total > 0 ? `${Math.round((val / total) * 100)}%` : "0%";
    }
    return pcts;
  }, [payments]);

  // Compute real Merkle root when payments change or view activates
  useEffect(() => {
    if (!activeView || payments.length === 0) return;

    setComputing(true);

    const leaves: MerkleLeaf[] = payments.map((p) => ({
      paymentId: p.account.paymentId.toNumber(),
      recipient: p.account.recipient.toBase58(),
      amount: p.account.amount.toNumber(),
      category: Object.keys(p.account.category)[0] || "other",
      timestamp: p.account.createdAt.toNumber(),
    }));

    computeMerkleRoot(leaves).then(async (result) => {
      setMerkleRoot(result.root);
      setLeafCount(result.leafCount);

      // Build auditor rows with pseudonymized addresses
      const rows = await Promise.all(
        payments.map(async (p) => ({
          id: `BB-${String(p.account.paymentId.toNumber()).padStart(3, "0")}`,
          vendor: await pseudonymize(p.account.recipient.toBase58()),
          amount: p.account.amount.toNumber() / 1_000_000,
          category: Object.keys(p.account.category)[0] || "other",
          date: new Date(p.account.createdAt.toNumber() * 1000).toISOString().split("T")[0],
        }))
      );
      setAuditorRows(rows);
      setComputing(false);
    });
  }, [activeView, payments]);

  const auditorTotal = auditorRows.reduce((s, r) => s + r.amount, 0);

  const handleCopy = () => {
    navigator.clipboard.writeText(merkleRoot);
    setCopied(true);
    toast.success("Merkle root copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAnchor = async () => {
    if (!activeView || !merkleRoot) return;
    setAnchoring(true);
    try {
      // Convert hex merkle root to byte array
      const rootBytes = Array.from(
        { length: 32 },
        (_, i) => parseInt(merkleRoot.slice(i * 2, i * 2 + 2), 16) || 0
      );
      const tx = await anchorProof(activeView, rootBytes, payments.length);
      setAnchoredTx(tx);
    } catch (e) {
      console.error("Anchor failed:", e);
    } finally {
      setAnchoring(false);
    }
  };

  // Reset anchored state when view changes
  useEffect(() => {
    setAnchoredTx(null);
  }, [activeView]);

  const handleExport = (format: "json" | "csv") => {
    const now = new Date().toISOString();

    if (format === "json") {
      const proof = {
        version: "1.0",
        type: activeView,
        merkleRoot,
        leafCount,
        generatedAt: now,
        company: { name: company?.name, address: companyPDA?.toBase58() },
        period: "all-time",
        data: activeView === "investor" ? {
          vaultBalance,
          totalSpent,
          monthlySpent,
          runway: runway > 0 ? +runway.toFixed(1) : null,
          memberCount,
          categoryBreakdown,
          paymentCount: payments.length,
          redacted: ["individual_payments", "vendor_names", "payment_amounts", "wallet_addresses"],
        } : activeView === "auditor" ? {
          payments: auditorRows,
          total: auditorTotal,
        } : {
          payments: payments.map((p) => ({
            id: p.account.paymentId.toNumber(),
            recipient: p.account.recipient.toBase58(),
            amount: p.account.amount.toNumber() / 1_000_000,
            category: Object.keys(p.account.category)[0],
            status: Object.keys(p.account.status)[0],
            timestamp: p.account.createdAt.toNumber(),
          })),
        },
      };
      const blob = new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `proof-${activeView}-${Date.now()}.json`; a.click();
    } else {
      const header = "ID,Vendor,Amount,Category,Date\n";
      const rows = auditorRows.map((r) => `${r.id},${r.vendor},${r.amount},${r.category},${r.date}`).join("\n");
      const blob = new Blob([header + rows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `audit-${Date.now()}.csv`; a.click();
    }
    toast.success(`Proof exported as ${format.toUpperCase()}`);
  };

  // Investor view fields — all from REAL on-chain data
  const investorFields = [
    { label: "Treasury Balance", value: `$${vaultBalance.toLocaleString()}`, visible: true },
    { label: "Total Spent", value: `$${totalSpent.toLocaleString()}`, visible: true },
    { label: "Monthly Spend", value: monthlySpent > 0 ? `$${monthlySpent.toLocaleString()}/mo` : "N/A", visible: true },
    { label: "Runway", value: runway > 0 ? `${runway.toFixed(1)} months` : "N/A", visible: true },
    { label: "Team Size", value: `${memberCount} member${memberCount !== 1 ? "s" : ""}`, visible: true },
    { label: "Category Split", value: Object.entries(categoryBreakdown).map(([k, v]) => `${k}: ${v}`).join(", ") || "No payments", visible: true },
    { label: "Individual Payments", value: "REDACTED", visible: false },
    { label: "Vendor Names", value: "REDACTED", visible: false },
    { label: "Payment Amounts", value: "REDACTED", visible: false },
    { label: "Wallet Addresses", value: "REDACTED", visible: false },
  ];

  const noPayments = payments.length === 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in">
      <div>
        <h1 className="text-heading">Selective Disclosure</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Generate cryptographic proofs from {payments.length} on-chain payment{payments.length !== 1 ? "s" : ""}
        </p>
      </div>

      {noPayments && (
        <div className="card p-5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
          <div>
            <p className="text-[13px] font-medium">No payments to prove</p>
            <p className="text-[12px] text-muted-foreground">Create payments first — proofs are generated from real on-chain data</p>
          </div>
        </div>
      )}

      {/* Proof Type Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => setActiveView("investor")}
          className={`card p-5 text-left transition-all ${activeView === "investor" ? "ring-2 ring-primary card-highlight" : "hover:border-primary/20"}`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold">Investor</h3>
              <p className="text-[11px] text-muted-foreground">Aggregates only</p>
            </div>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex items-center gap-2 text-success"><Eye className="w-3 h-3" /> Burn rate, runway, %</div>
            <div className="flex items-center gap-2 text-destructive"><EyeOff className="w-3 h-3" /> No individual data</div>
          </div>
        </button>

        <button
          onClick={() => setActiveView("auditor")}
          className={`card p-5 text-left transition-all ${activeView === "auditor" ? "ring-2 ring-primary card-highlight" : "hover:border-primary/20"}`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold">Auditor</h3>
              <p className="text-[11px] text-muted-foreground">Pseudonymized</p>
            </div>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex items-center gap-2 text-success"><Eye className="w-3 h-3" /> All amounts & dates</div>
            <div className="flex items-center gap-2 text-destructive"><EyeOff className="w-3 h-3" /> Vendors pseudonymized</div>
          </div>
        </button>

        <button
          onClick={() => setActiveView("regulator")}
          className={`card p-5 text-left transition-all ${activeView === "regulator" ? "ring-2 ring-primary card-highlight" : "hover:border-primary/20"}`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold">Regulator</h3>
              <p className="text-[11px] text-muted-foreground">Full disclosure</p>
            </div>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex items-center gap-2 text-success"><Unlock className="w-3 h-3" /> Everything visible</div>
            <div className="flex items-center gap-2 text-muted-foreground"><Lock className="w-3 h-3" /> Requires 2/2 multisig</div>
          </div>
        </button>
      </div>

      {/* Computing indicator */}
      {computing && (
        <div className="card p-4 flex items-center justify-center gap-3 text-[13px] text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          Computing Merkle tree from {payments.length} payments...
        </div>
      )}

      {/* ─── INVESTOR VIEW ─────────────────────────────────────────── */}
      {activeView === "investor" && !computing && (
        <div className="space-y-4 animate-in">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold">Investor Proof</h3>
              <span className="badge badge-info"><Lock className="w-3 h-3" /> Selective Disclosure</span>
            </div>
            <p className="text-[12px] text-muted-foreground mb-4">
              Aggregates computed from {payments.length} on-chain payments — no individual data exposed
            </p>
            <div className="grid grid-cols-2 gap-2">
              {investorFields.map((f, i) => (
                <div key={i} className={`rounded-lg px-3 py-2.5 ${f.visible ? "bg-[rgba(255,255,255,0.02)]" : "bg-destructive/5 border border-destructive/10"}`}>
                  <div className="text-[11px] text-muted-foreground">{f.label}</div>
                  <div className={`text-[13px] font-mono mt-0.5 flex items-center gap-1.5 ${f.visible ? "" : "text-destructive"}`}>
                    {f.visible ? <Eye className="w-3 h-3 text-success shrink-0" /> : <EyeOff className="w-3 h-3 shrink-0" />}
                    <span className="truncate">{f.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Merkle footer */}
          <div className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Hash className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground">Merkle Root ({leafCount} leaves)</div>
                <div className="text-[13px] font-mono truncate">{abbreviateHash(merkleRoot)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={handleCopy} className="btn-ghost text-[11px] py-1 px-2">
                {copied ? <CheckCircle2 className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={() => handleExport("json")} className="btn-secondary text-[11px] py-1 px-2">
                <Download className="w-3 h-3" /> JSON
              </button>
            </div>
          </div>

          {/* Anchor on-chain */}
          {wallet.connected && (
            <button
              onClick={handleAnchor}
              disabled={anchoring || !merkleRoot}
              className={`w-full text-[13px] py-2.5 ${anchoredTx ? "btn-ghost text-success" : "btn-primary"}`}
            >
              {anchoring ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Anchoring on-chain...</>
              ) : anchoredTx ? (
                <><CheckCircle2 className="w-4 h-4" /> Anchored — {anchoredTx.slice(0, 12)}...</>
              ) : (
                <><Anchor className="w-4 h-4" /> Anchor Proof On-Chain</>
              )}
            </button>
          )}
        </div>
      )}

      {/* ─── AUDITOR VIEW ──────────────────────────────────────────── */}
      {activeView === "auditor" && !computing && (
        <div className="space-y-4 animate-in">
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">Auditor Proof</h3>
              <span className="badge badge-info"><Lock className="w-3 h-3" /> Pseudonymized</span>
            </div>

            {auditorRows.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-muted-foreground">No payments to display</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] text-muted-foreground uppercase">
                      <th className="px-5 py-2">ID</th>
                      <th className="px-5 py-2">Vendor</th>
                      <th className="px-5 py-2">Category</th>
                      <th className="px-5 py-2">Date</th>
                      <th className="px-5 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditorRows.map((r) => (
                      <tr key={r.id} className="border-b border-border/50">
                        <td className="px-5 py-2.5 font-mono text-[12px]">{r.id}</td>
                        <td className="px-5 py-2.5 font-mono text-[12px] text-muted-foreground">{r.vendor}</td>
                        <td className="px-5 py-2.5 capitalize">{r.category}</td>
                        <td className="px-5 py-2.5 text-muted-foreground">{r.date}</td>
                        <td className="px-5 py-2.5 text-right font-mono">${r.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td colSpan={4} className="px-5 py-2.5">Total</td>
                      <td className="px-5 py-2.5 text-right font-mono">${auditorTotal.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Hash className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground">Same Merkle Root — proves same dataset as Investor view</div>
                <div className="text-[13px] font-mono truncate">{abbreviateHash(merkleRoot)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => handleExport("csv")} className="btn-secondary text-[11px] py-1 px-2">
                <Download className="w-3 h-3" /> CSV
              </button>
              <button onClick={() => handleExport("json")} className="btn-secondary text-[11px] py-1 px-2">
                <Download className="w-3 h-3" /> JSON
              </button>
            </div>
          </div>

          {/* Anchor on-chain */}
          {wallet.connected && (
            <button
              onClick={handleAnchor}
              disabled={anchoring || !merkleRoot}
              className={`w-full text-[13px] py-2.5 ${anchoredTx ? "btn-ghost text-success" : "btn-primary"}`}
            >
              {anchoring ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Anchoring on-chain...</>
              ) : anchoredTx ? (
                <><CheckCircle2 className="w-4 h-4" /> Anchored — {anchoredTx.slice(0, 12)}...</>
              ) : (
                <><Anchor className="w-4 h-4" /> Anchor Proof On-Chain</>
              )}
            </button>
          )}
        </div>
      )}

      {/* ─── REGULATOR VIEW ────────────────────────────────────────── */}
      {activeView === "regulator" && !computing && (
        <div className="space-y-4 animate-in">
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">Regulator Proof — Full Disclosure</h3>
              <span className="badge badge-warning"><Unlock className="w-3 h-3" /> Unredacted</span>
            </div>

            {payments.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-muted-foreground">No payments to display</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] text-muted-foreground uppercase">
                      <th className="px-5 py-2">ID</th>
                      <th className="px-5 py-2">Recipient</th>
                      <th className="px-5 py-2">Category</th>
                      <th className="px-5 py-2">Status</th>
                      <th className="px-5 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.publicKey.toBase58()} className="border-b border-border/50">
                        <td className="px-5 py-2.5 font-mono text-[12px]">BB-{String(p.account.paymentId.toNumber()).padStart(3, "0")}</td>
                        <td className="px-5 py-2.5 font-mono text-[11px]">{p.account.recipient.toBase58()}</td>
                        <td className="px-5 py-2.5 capitalize">{Object.keys(p.account.category)[0]}</td>
                        <td className="px-5 py-2.5">
                          <span className={`badge ${
                            p.account.status.executed !== undefined ? "badge-success" :
                            p.account.status.pending !== undefined ? "badge-warning" :
                            "badge-danger"
                          }`}>
                            {Object.keys(p.account.status)[0]}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono">${(p.account.amount.toNumber() / 1_000_000).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card p-4 flex items-center gap-3 text-[12px] text-muted-foreground">
            <Shield className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Full disclosure export requires multi-sig authorization from 2+ Owners in production</span>
          </div>

          <button onClick={() => handleExport("json")} className="btn-primary w-full text-[13px]">
            <Download className="w-4 h-4" /> Export Full Disclosure JSON
          </button>

          {/* Anchor on-chain */}
          {wallet.connected && (
            <button
              onClick={handleAnchor}
              disabled={anchoring || !merkleRoot}
              className={`w-full text-[13px] py-2.5 ${anchoredTx ? "btn-ghost text-success" : "btn-primary"}`}
            >
              {anchoring ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Anchoring on-chain...</>
              ) : anchoredTx ? (
                <><CheckCircle2 className="w-4 h-4" /> Anchored — {anchoredTx.slice(0, 12)}...</>
              ) : (
                <><Anchor className="w-4 h-4" /> Anchor Proof On-Chain</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
