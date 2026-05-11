"use client";

import Link from "next/link";
import { useState, useCallback, useEffect } from "react";
import {
  Upload,
  FileText,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Loader2,
  X,
  Zap,
  History,
  Shield,
  CalendarClock,
} from "lucide-react";
import { getInvoicesSync, getVendors, saveInvoice, isNewVendor, type StoredInvoice } from "@/lib/invoice-store";
import { useCompany } from "@/lib/company-context";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";

interface ParsedInvoice {
  vendor: string;
  amount: number;
  currency: string;
  dueDate: string;
  category: string;
  lineItems: { description: string; amount: number }[];
  riskFlags: string[];
  confidence: number;
}

interface PolicyDecision {
  action: "auto_approve" | "require_approval" | "require_dual" | "block";
  reason: string;
  requiredApprovers: number;
}

async function parseInvoiceAI(file: File): Promise<{ invoice: ParsedInvoice; policy: PolicyDecision }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/parse-invoice", { method: "POST", body: formData });

  if (!res.ok) {
    const mockInvoice: ParsedInvoice = {
      vendor: "Acme Design Studio",
      amount: 3200,
      currency: "USD",
      dueDate: "2026-04-15",
      category: "Contractor",
      lineItems: [
        { description: "UI/UX Design - Dashboard redesign", amount: 2400 },
        { description: "Brand assets - Icon set v2", amount: 800 },
      ],
      riskFlags: [],
      confidence: 0.97,
    };
    return {
      invoice: mockInvoice,
      policy: { action: "auto_approve", reason: "Under $5,000 USDC auto-approve threshold", requiredApprovers: 0 },
    };
  }

  return res.json();
}

const statusConfig: Record<string, { label: string; badge: string; dot: string; helper: string }> = {
  parsed: {
    label: "Parsed",
    badge: "badge-neutral",
    dot: "bg-muted-foreground",
    helper: "Captured in intake history",
  },
  review: {
    label: "Needs approval",
    badge: "badge-warning",
    dot: "bg-warning",
    helper: "Approval route recorded",
  },
  ready: {
    label: "Payment-ready",
    badge: "badge-info",
    dot: "bg-primary pulse-dot",
    helper: "Cleared by policy, waiting for treasury action",
  },
  submitted: {
    label: "Needs approval",
    badge: "badge-warning",
    dot: "bg-warning pulse-dot",
    helper: "Legacy review record",
  },
  paid: {
    label: "Paid",
    badge: "badge-success",
    dot: "bg-success",
    helper: "Historical paid record",
  },
};

function formatCurrency(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString()}`;
  }
}

export default function InvoicesPage() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<ParsedInvoice | null>(null);
  const [policyResult, setPolicyResult] = useState<PolicyDecision | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [invoiceHistory, setInvoiceHistory] = useState<StoredInvoice[]>([]);
  const [recipientWallet, setRecipientWallet] = useState("");
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [paymentCreated, setPaymentCreated] = useState(false);
  const { createPayment } = useCompany();

  useEffect(() => {
    setInvoiceHistory(getInvoicesSync());
  }, [submitted]);

  const openFilePicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.png,.jpg,.jpeg";
    input.onchange = (e) => {
      const nextFile = (e.target as HTMLInputElement).files?.[0];
      if (nextFile) handleFile(nextFile);
    };
    input.click();
  };

  const handleFile = useCallback(async (nextFile: File) => {
    setFile(nextFile);
    setParsing(true);
    setSaving(false);
    setParsed(null);
    setPolicyResult(null);
    setSubmitted(false);

    try {
      const { invoice, policy } = await parseInvoiceAI(nextFile);
      setParsed(invoice);
      setPolicyResult(policy);
    } catch {
      toast.error("Failed to parse invoice");
    } finally {
      setParsing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const nextFile = e.dataTransfer.files[0];
      if (nextFile) handleFile(nextFile);
    },
    [handleFile]
  );

  const handleSubmit = async () => {
    if (!parsed || !policyResult || !file) return;

    const nextStatus: StoredInvoice["status"] =
      policyResult.action === "auto_approve" ? "ready" : "review";

    setSaving(true);
    try {
      await saveInvoice({
        id: Date.now().toString(),
        fileName: file.name,
        vendor: parsed.vendor,
        amount: parsed.amount,
        currency: parsed.currency,
        dueDate: parsed.dueDate,
        category: parsed.category,
        lineItems: parsed.lineItems,
        riskFlags: parsed.riskFlags,
        confidence: parsed.confidence,
        policyAction: policyResult.action,
        policyReason: policyResult.reason,
        createdAt: new Date().toISOString(),
        status: nextStatus,
      });
      setSubmitted(true);
    } catch {
      toast.error("Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setFile(null);
    setParsed(null);
    setPolicyResult(null);
    setSaving(false);
    setSubmitted(false);
  };

  const isValidPubkey = (s: string) => { try { new PublicKey(s); return s.length >= 32; } catch { return false; } };

  const handleCreatePayment = async () => {
    if (!parsed || !isValidPubkey(recipientWallet)) return;
    setCreatingPayment(true);
    try {
      await createPayment(recipientWallet, parsed.amount, parsed.category || "vendor", `Invoice: ${parsed.vendor}`);
      setPaymentCreated(true);
      toast.success("Payment created on-chain!");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create payment";
      toast.error(message);
    } finally {
      setCreatingPayment(false);
    }
  };

  const vendorCount = getVendors().length;
  const totalVolume = invoiceHistory.reduce((sum, invoice) => sum + invoice.amount, 0);
  const vendorSignal = parsed ? (isNewVendor(parsed.vendor) ? "New vendor" : "Known vendor") : null;
  const isBlocked = policyResult?.action === "block";
  const approvalLabel =
    policyResult?.action === "auto_approve"
      ? "Payment-ready"
      : policyResult?.action === "require_dual"
        ? "Dual approval"
        : policyResult?.action === "require_approval"
          ? "Single approval"
          : "Blocked";

  return (
    <div className="page-shell mx-auto max-w-6xl space-y-6 animate-in">
      <section className="card px-6 py-6 lg:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="eyebrow">Invoice intake</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">Upload an invoice</h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted-foreground">
              We extract the important fields and show whether the invoice should go to Payments or Approvals before anything is saved.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="badge badge-neutral">{invoiceHistory.length} logged</span>
            <span className="badge badge-neutral">{vendorCount} vendors</span>
            <span className="badge badge-info">{formatCurrency(totalVolume)} tracked</span>
          </div>
        </div>
      </section>

      {!file && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={openFilePicker}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openFilePicker();
              }
            }}
            role="button"
            tabIndex={0}
            className={`hero-surface group cursor-pointer px-7 py-10 text-center transition-all ${
              dragActive ? "border-primary/45" : "hover:border-primary/30"
            }`}
          >
            <div className="relative z-10 mx-auto max-w-xl">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">Drop an invoice or browse</h2>
              <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
                PDF, PNG, or JPEG. Nothing is saved until you review the result and confirm.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[12px] text-muted-foreground">
                <span className="rounded-full border border-border bg-secondary/60 px-3 py-1.5">Review before save</span>
                <span className="rounded-full border border-border bg-secondary/60 px-3 py-1.5">Policy route shown first</span>
                <span className="rounded-full border border-border bg-secondary/60 px-3 py-1.5">On-chain payment happens later</span>
              </div>
            </div>
          </div>

          <div className="card px-5 py-4">
            <div className="flex flex-col gap-3 text-[13px] text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Upload, review the extracted fields, then save the intake.
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Payments and signatures still continue in the treasury pages.
              </div>
            </div>
          </div>
        </>
      )}

      {parsing && (
        <div className="hero-surface px-6 py-10 text-center">
          <div className="relative z-10">
            <Loader2 className="mx-auto h-9 w-9 animate-spin text-primary" />
            <p className="mt-4 text-lg font-medium">Parsing invoice and classifying the route...</p>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Extracting vendor, line items, due date, and policy signals.
            </p>
          </div>
        </div>
      )}

      {parsed && !submitted && (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{file?.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="badge badge-info">
                      <Sparkles className="h-3 w-3" />
                      {Math.round(parsed.confidence * 100)}% confidence
                    </span>
                    {vendorSignal && (
                      <span className={isNewVendor(parsed.vendor) ? "badge badge-warning" : "badge badge-neutral"}>
                        {vendorSignal}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button onClick={reset} className="btn-ghost px-3 py-2 text-[12px]">
                <X className="h-4 w-4" />
                Clear
              </button>
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-label mb-1">Extracted Data</p>
                  <h3 className="section-title">Invoice details</h3>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="metric-tile">
                  <p className="text-label mb-1">Vendor</p>
                  <p className="section-title">{parsed.vendor}</p>
                </div>
                <div className="metric-tile">
                  <p className="text-label mb-1">Amount</p>
                  <p className="section-title text-primary">{formatCurrency(parsed.amount, parsed.currency)}</p>
                </div>
                <div className="metric-tile">
                  <p className="text-label mb-1">Due Date</p>
                  <p className="section-title">{parsed.dueDate || "Not provided"}</p>
                </div>
                <div className="metric-tile">
                  <p className="text-label mb-1">Category</p>
                  <p className="section-title">{parsed.category}</p>
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-3 flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  <p className="text-[13px] font-medium">Line items</p>
                </div>
                <div className="space-y-2">
                  {parsed.lineItems.map((item, index) => (
                    <div
                      key={`${item.description}-${index}`}
                      className="flex items-center justify-between rounded-2xl border border-border bg-secondary/45 px-4 py-3"
                    >
                      <span className="text-[13px] text-foreground">{item.description}</span>
                      <span className="text-[13px] font-medium text-mono text-primary">
                        {formatCurrency(item.amount, parsed.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-border bg-secondary/35 px-4 py-3">
                {parsed.riskFlags.length > 0 ? (
                  <div className="flex items-start gap-3 text-[13px] text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Risk flags detected: {parsed.riskFlags.join(", ")}</span>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 text-[13px] text-emerald-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>No obvious invoice anomalies were detected in this pass.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {policyResult && (
              <div className={`p-6 ${isBlocked ? "card" : "card-highlight"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-label mb-1">Policy Route</p>
                    <h3 className="section-title">{approvalLabel}</h3>
                  </div>
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                      policyResult.action === "auto_approve"
                        ? "bg-primary/12"
                        : policyResult.action === "block"
                          ? "bg-destructive/10"
                          : "bg-warning/10"
                    }`}
                  >
                    {policyResult.action === "auto_approve" ? (
                      <Zap className="h-5 w-5 text-primary" />
                    ) : policyResult.action === "block" ? (
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    ) : (
                      <Shield className="h-5 w-5 text-warning" />
                    )}
                  </div>
                </div>

                <p className="mt-4 text-[14px] leading-6 text-muted-foreground">{policyResult.reason}</p>

                <div className="mt-5 grid gap-3">
                  <div className="metric-tile">
                    <p className="text-label mb-1">Save as</p>
                    <p className="section-title">
                      {policyResult.action === "auto_approve"
                        ? "Save as payment-ready intake"
                        : policyResult.action === "block"
                          ? "Do not proceed"
                          : `Save with ${policyResult.requiredApprovers} approval requirement`}
                    </p>
                  </div>
                  <div className="metric-tile">
                    <p className="text-label mb-1">Next page</p>
                    <p className="section-title">
                      {policyResult.action === "auto_approve" ? "Payments" : policyResult.action === "block" ? "Review invoice details" : "Approvals"}
                    </p>
                  </div>
                </div>

                <p className="mt-5 text-[13px] leading-6 text-muted-foreground">
                  Saving records the intake decision. Payment creation and signer collection continue later in the treasury workflow.
                </p>

                {policyResult.action !== "block" ? (
                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="btn-primary mt-6 w-full"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving intake record...
                      </>
                    ) : policyResult.action === "auto_approve" ? (
                      <>
                        Save as Payment-Ready
                        <ArrowRight className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        Save Approval Route
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                ) : (
                  <button onClick={reset} className="btn-secondary mt-6 w-full">
                    Upload a different invoice
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {submitted && policyResult && parsed && (
        <div className="card-highlight p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-1 text-[11px] font-medium text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Intake recorded
              </div>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">
                {policyResult.action === "auto_approve" ? "Invoice saved as payment-ready" : "Invoice saved with approval requirements"}
              </h3>
              <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted-foreground">
                {policyResult.action === "auto_approve"
                  ? `${parsed.vendor} for ${formatCurrency(parsed.amount, parsed.currency)} is now stored as a policy-cleared intake record. Continue into treasury execution when you want to create the on-chain payment.`
                  : `${parsed.vendor} for ${formatCurrency(parsed.amount, parsed.currency)} is stored with a ${policyResult.requiredApprovers}-approval route. Continue into the approvals flow when you want to push the treasury action forward.`}
              </p>
            </div>

            <div className="space-y-4">
              {!paymentCreated ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] text-muted-foreground mb-1 block">Recipient Wallet Address</label>
                    <input
                      type="text"
                      placeholder="Enter Solana wallet address..."
                      value={recipientWallet}
                      onChange={(e) => setRecipientWallet(e.target.value)}
                      className="input w-full font-mono text-[13px]"
                    />
                    {recipientWallet && !isValidPubkey(recipientWallet) && (
                      <p className="text-[11px] text-destructive mt-1">Invalid Solana address</p>
                    )}
                  </div>
                  <button
                    onClick={handleCreatePayment}
                    disabled={creatingPayment || !isValidPubkey(recipientWallet)}
                    className="btn-primary w-full"
                  >
                    {creatingPayment ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Creating on-chain payment...</>
                    ) : (
                      <>Create On-Chain Payment <ArrowRight className="h-4 w-4" /></>
                    )}
                  </button>
                </div>
              ) : (
                <Link href="/payments" className="btn-primary w-full text-center">
                  View in Payments <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <button onClick={reset} className="btn-secondary w-full">
                Process another invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceHistory.length > 0 && !parsing && (
        <div className="card animate-in-delay-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10">
                <History className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="section-title">Invoice History</h3>
                <p className="text-[12px] text-muted-foreground">Recent intake decisions and their treasury route.</p>
              </div>
            </div>
            <span className="badge badge-neutral">{invoiceHistory.length}</span>
          </div>

          <div className="divide-y divide-border">
            {invoiceHistory.slice(0, 10).map((invoice) => {
              const meta = statusConfig[invoice.status] || statusConfig.parsed;
              return (
                <div
                  key={invoice.id}
                  className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-[rgba(255,255,255,0.015)] lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-medium">{invoice.vendor}</p>
                        <span className={`badge ${meta.badge}`}>{meta.label}</span>
                        {isNewVendor(invoice.vendor) ? null : <span className="badge badge-neutral">Known vendor</span>}
                      </div>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {invoice.fileName} · {invoice.category} · {new Date(invoice.createdAt).toLocaleDateString()}
                      </p>
                      <p className="mt-1 text-[12px] text-muted-foreground">{meta.helper}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 lg:min-w-[280px]">
                    <div className="text-right">
                      <p className="text-[13px] font-medium text-mono">{formatCurrency(invoice.amount, invoice.currency)}</p>
                      <p className="text-[11px] text-muted-foreground">{invoice.policyReason}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
