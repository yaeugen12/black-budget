"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useCompany } from "@/lib/company-context";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  computeMerkleRoot,
  abbreviateHash,
  hexToBytes32,
  type MerkleLeaf,
} from "@/lib/merkle";
import {
  type Constraint,
  type Operator,
  type ComplianceQuery,
  type ComplianceResult,
  type ComplianceDataset,
  COMPLIANCE_TEMPLATES,
  evaluateCompliance,
  computeConstraintHash,
} from "@/lib/compliance";
import {
  Shield,
  TrendingDown,
  DollarSign,
  Users,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Copy,
  Download,
  Loader2,
  Anchor,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Hash,
  Zap,
} from "lucide-react";

const TEMPLATE_ICONS = [Shield, TrendingDown, DollarSign, Users];
const TEMPLATE_COLORS = [
  "bg-emerald-500/10 text-emerald-400",
  "bg-amber-500/10 text-amber-400",
  "bg-blue-500/10 text-blue-400",
  "bg-violet-500/10 text-violet-400",
];

const KIND_OPTIONS: { value: Constraint["kind"]; label: string }[] = [
  { value: "runway", label: "Runway (months)" },
  { value: "category_cap", label: "Category cap (%)" },
  { value: "total_spend", label: "Total spend (USD)" },
  { value: "vendor_concentration", label: "Vendor concentration (%)" },
  { value: "payment_count", label: "Payment count" },
];

const OPERATOR_OPTIONS: { value: Operator; label: string }[] = [
  { value: ">", label: ">" },
  { value: ">=", label: ">=" },
  { value: "<", label: "<" },
  { value: "<=", label: "<=" },
  { value: "==", label: "==" },
  { value: "!=", label: "!=" },
];

function defaultConstraint(): Constraint {
  return { kind: "runway", operator: ">=", months: 6 } as Constraint;
}

function getConstraintValue(c: Constraint): number {
  switch (c.kind) {
    case "runway": return c.months;
    case "category_cap": return c.percent;
    case "total_spend": return c.amount;
    case "vendor_concentration": return c.percent;
    case "payment_count": return c.count;
  }
}

function buildConstraint(kind: Constraint["kind"], operator: Operator, value: number, category?: string): Constraint {
  switch (kind) {
    case "runway": return { kind, operator, months: value };
    case "category_cap": return { kind, operator, percent: value, category: category || "other" };
    case "total_spend": return { kind, operator, amount: value };
    case "vendor_concentration": return { kind, operator, percent: value };
    case "payment_count": return { kind, operator, count: value };
  }
}

export default function ComplianceProofsPage() {
  const { company, companyPDA, vaultBalance, payments, anchorProof } = useCompany();
  const wallet = useWallet();

  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const [anchoredTx, setAnchoredTx] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [merkleRoot, setMerkleRoot] = useState("");

  // Custom query builder state
  const [customExpanded, setCustomExpanded] = useState(false);
  const [customName, setCustomName] = useState("Custom Query");
  const [customConstraints, setCustomConstraints] = useState<Constraint[]>([defaultConstraint()]);

  const totalSpent = company ? company.totalSpent.toNumber() / 1_000_000 : 0;
  const monthlySpent = company ? company.monthlySpent.toNumber() / 1_000_000 : 0;

  // Compute merkle root when payments change
  useEffect(() => {
    if (payments.length === 0) {
      setMerkleRoot("");
      return;
    }
    const leaves: MerkleLeaf[] = payments.map((p) => ({
      paymentId: p.account.paymentId.toNumber(),
      recipient: p.account.recipient.toBase58(),
      amount: p.account.amount.toNumber(),
      category: Object.keys(p.account.category)[0] || "other",
      timestamp: p.account.createdAt.toNumber(),
    }));
    computeMerkleRoot(leaves).then((r) => setMerkleRoot(r.root));
  }, [payments]);

  const dataset: ComplianceDataset = useMemo(() => ({
    payments: payments.map((p) => ({
      amount: p.account.amount.toNumber(),
      category: Object.keys(p.account.category)[0] || "other",
      recipient: p.account.recipient.toBase58(),
    })),
    vaultBalance,
    monthlySpent,
    totalSpent,
    merkleRoot,
  }), [payments, vaultBalance, monthlySpent, totalSpent, merkleRoot]);

  // ─── Evaluate a query ────────────────────────────────────────────

  const handleEvaluate = async (query: ComplianceQuery) => {
    setEvaluating(true);
    setAnchoredTx(null);
    try {
      const res = await evaluateCompliance(query, dataset);
      setResult(res);
      if (res.passed) {
        toast.success("All constraints passed");
      } else {
        toast.error("Some constraints failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  };

  const handleEvaluateCustom = () => {
    const query: ComplianceQuery = {
      name: customName,
      description: "Custom compliance query",
      constraints: customConstraints,
    };
    handleEvaluate(query);
  };

  // ─── On-chain anchor ─────────────────────────────────────────────

  const handleAnchor = async () => {
    if (!result || !companyPDA) return;
    setAnchoring(true);
    try {
      const constraintHashBytes = hexToBytes32(
        result.constraintHash.startsWith("0x") ? result.constraintHash : "0x" + result.constraintHash
      );
      const merkleRootBytes = hexToBytes32(result.merkleRoot);
      const now = Math.floor(Date.now() / 1000);
      const periodStart = now - 86400 * 30;
      const periodEnd = now;

      const tx = await anchorProof(
        "investor",
        merkleRootBytes,
        result.paymentCount,
      );
      setAnchoredTx(tx);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to anchor proof");
    } finally {
      setAnchoring(false);
    }
  };

  // ─── Copy / Export ───────────────────────────────────────────────

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    if (!result) return;
    const proof = {
      version: "1.0",
      type: "compliance",
      query: result.query.name,
      passed: result.passed,
      constraintHash: result.constraintHash,
      merkleRoot: result.merkleRoot,
      paymentCount: result.paymentCount,
      evaluatedAt: new Date(result.evaluatedAt * 1000).toISOString(),
      constraints: result.results.map((r) => ({
        label: r.label,
        passed: r.passed,
        actualValue: r.actualValue,
        threshold: r.threshold,
      })),
      company: { name: company?.name, address: companyPDA?.toBase58() },
    };
    const blob = new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-proof-${Date.now()}.json`;
    a.click();
    toast.success("Proof exported as JSON");
  };

  // ─── Custom constraint management ────────────────────────────────

  const addConstraint = () => {
    setCustomConstraints([...customConstraints, defaultConstraint()]);
  };

  const removeConstraint = (index: number) => {
    setCustomConstraints(customConstraints.filter((_, i) => i !== index));
  };

  const updateConstraint = (index: number, field: string, value: string | number) => {
    setCustomConstraints(customConstraints.map((c, i) => {
      if (i !== index) return c;
      if (field === "kind") {
        return buildConstraint(value as Constraint["kind"], c.operator, getConstraintValue(c));
      }
      if (field === "operator") {
        return buildConstraint(c.kind, value as Operator, getConstraintValue(c));
      }
      if (field === "value") {
        return buildConstraint(c.kind, c.operator, Number(value), c.kind === "category_cap" ? (c as any).category : undefined);
      }
      if (field === "category") {
        return buildConstraint(c.kind, c.operator, getConstraintValue(c), value as string);
      }
      return c;
    }));
  };

  const noPayments = payments.length === 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in">
      {/* Header */}
      <div>
        <Link
          href="/proofs"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to Selective Disclosure
        </Link>
        <h1 className="text-heading">Compliance Proofs</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Prove financial compliance without revealing sensitive data
        </p>
      </div>

      {noPayments && (
        <div className="card p-5 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-destructive shrink-0" />
          <div>
            <p className="text-[13px] font-medium">No payments to evaluate</p>
            <p className="text-[12px] text-muted-foreground">
              Create payments first — compliance proofs evaluate real on-chain data
            </p>
          </div>
        </div>
      )}

      {/* Template Picker */}
      <div>
        <h2 className="text-[14px] font-semibold mb-3">Quick Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {COMPLIANCE_TEMPLATES.map((template, i) => {
            const Icon = TEMPLATE_ICONS[i];
            const colorClass = TEMPLATE_COLORS[i];
            const isActive = result?.query.name === template.name;
            return (
              <button
                key={template.name}
                onClick={() => handleEvaluate(template)}
                disabled={evaluating || noPayments}
                className={`card p-4 text-left transition-all ${
                  isActive
                    ? "ring-2 ring-primary card-highlight"
                    : "hover:border-primary/20"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colorClass.split(" ")[0]}`}>
                    <Icon className={`w-4 h-4 ${colorClass.split(" ")[1]}`} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold">{template.name}</h3>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {template.description}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {template.constraints.map((c, ci) => (
                    <span key={ci} className="badge badge-neutral text-[10px]">
                      {c.kind.replace("_", " ")}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Query Builder */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setCustomExpanded(!customExpanded)}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-[rgba(255,255,255,0.015)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div className="text-left">
              <h3 className="text-[14px] font-semibold">Custom Query</h3>
              <p className="text-[11px] text-muted-foreground">
                Build your own compliance check
              </p>
            </div>
          </div>
          {customExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {customExpanded && (
          <div className="border-t border-border px-5 py-4 space-y-4 animate-in">
            {/* Query Name */}
            <div>
              <label className="text-label mb-1.5 block">Query Name</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="input max-w-sm"
                placeholder="My compliance check"
              />
            </div>

            {/* Constraints */}
            <div>
              <label className="text-label mb-2 block">Constraints</label>
              <div className="space-y-2">
                {customConstraints.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg bg-[rgba(255,255,255,0.02)] px-3 py-2"
                  >
                    <select
                      value={c.kind}
                      onChange={(e) => updateConstraint(i, "kind", e.target.value)}
                      className="input text-[13px] py-1.5 px-2 max-w-[180px]"
                    >
                      {KIND_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>

                    {c.kind === "category_cap" && (
                      <input
                        type="text"
                        value={(c as any).category || ""}
                        onChange={(e) => updateConstraint(i, "category", e.target.value)}
                        placeholder="category"
                        className="input text-[13px] py-1.5 px-2 max-w-[120px]"
                      />
                    )}

                    <select
                      value={c.operator}
                      onChange={(e) => updateConstraint(i, "operator", e.target.value)}
                      className="input text-[13px] py-1.5 px-2 max-w-[70px] font-mono"
                    >
                      {OPERATOR_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>

                    <input
                      type="number"
                      value={getConstraintValue(c)}
                      onChange={(e) => updateConstraint(i, "value", e.target.value)}
                      className="input text-[13px] py-1.5 px-2 max-w-[100px] font-mono"
                    />

                    <button
                      onClick={() => removeConstraint(i)}
                      disabled={customConstraints.length <= 1}
                      className="btn-ghost p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={addConstraint}
                className="btn-ghost text-[12px] mt-2 py-1 px-2 text-primary"
              >
                <Plus className="w-3 h-3" /> Add constraint
              </button>
            </div>

            {/* Evaluate */}
            <button
              onClick={handleEvaluateCustom}
              disabled={evaluating || noPayments || customConstraints.length === 0}
              className="btn-primary text-[13px] py-2 px-4"
            >
              {evaluating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Evaluating...</>
              ) : (
                <><Shield className="w-4 h-4" /> Evaluate Query</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Evaluating indicator */}
      {evaluating && (
        <div className="card p-4 flex items-center justify-center gap-3 text-[13px] text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          Evaluating compliance constraints...
        </div>
      )}

      {/* ─── Results Panel ──────────────────────────────────────────── */}
      {result && !evaluating && (
        <div className="space-y-4 animate-in">
          {/* Big pass/fail badge */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold">{result.query.name}</h3>
              <span className={`badge ${result.passed ? "badge-success" : "badge-danger"}`}>
                {result.passed ? (
                  <><CheckCircle2 className="w-3 h-3" /> PASSED</>
                ) : (
                  <><XCircle className="w-3 h-3" /> FAILED</>
                )}
              </span>
            </div>

            {/* Overall result */}
            <div className={`rounded-xl p-5 mb-5 flex items-center justify-center gap-3 ${
              result.passed
                ? "bg-emerald-500/5 border border-emerald-500/10"
                : "bg-destructive/5 border border-destructive/10"
            }`}>
              {result.passed ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              ) : (
                <XCircle className="w-8 h-8 text-destructive" />
              )}
              <span className="text-[20px] font-bold">
                {result.passed ? "COMPLIANT" : "NON-COMPLIANT"}
              </span>
            </div>

            {/* Constraint results */}
            <div className="space-y-2">
              {result.results.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${
                    r.passed
                      ? "bg-[rgba(255,255,255,0.02)]"
                      : "bg-destructive/5 border border-destructive/10"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {r.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <span className="text-[13px] truncate">{r.label}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-[13px] font-mono">
                    <span className="text-muted-foreground">
                      actual: <span className="text-foreground">{
                        r.constraint.kind === "total_spend"
                          ? `$${r.actualValue.toLocaleString()}`
                          : r.constraint.kind === "runway"
                            ? `${r.actualValue} mo`
                            : r.constraint.kind === "payment_count"
                              ? r.actualValue
                              : `${r.actualValue}%`
                      }</span>
                    </span>
                    <span className="text-muted-foreground">
                      threshold: <span className="text-foreground">{
                        r.constraint.kind === "total_spend"
                          ? `$${r.threshold.toLocaleString()}`
                          : r.constraint.kind === "runway"
                            ? `${r.threshold} mo`
                            : r.constraint.kind === "payment_count"
                              ? r.threshold
                              : `${r.threshold}%`
                      }</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hashes */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <Hash className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground">Constraint Hash</div>
                  <div className="text-[13px] font-mono truncate">
                    {abbreviateHash(result.constraintHash)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleCopy(result.constraintHash)}
                className="btn-ghost text-[11px] py-1 px-2"
              >
                {copied ? <CheckCircle2 className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="border-t border-border pt-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <Hash className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground">
                    Merkle Root ({result.paymentCount} payments)
                  </div>
                  <div className="text-[13px] font-mono truncate">
                    {abbreviateHash(result.merkleRoot)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleCopy(result.merkleRoot)}
                className="btn-ghost text-[11px] py-1 px-2"
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={handleExport} className="btn-secondary text-[13px] py-2 px-4 flex-1">
              <Download className="w-4 h-4" /> Export Proof JSON
            </button>
          </div>

          {wallet.connected && (
            <button
              onClick={handleAnchor}
              disabled={anchoring || !result.merkleRoot}
              className={`w-full text-[13px] py-2.5 ${
                anchoredTx ? "btn-ghost text-success" : "btn-primary"
              }`}
            >
              {anchoring ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Anchoring on-chain...</>
              ) : anchoredTx ? (
                <><CheckCircle2 className="w-4 h-4" /> Anchored — {anchoredTx.slice(0, 12)}...</>
              ) : (
                <><Anchor className="w-4 h-4" /> Anchor On-Chain</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
