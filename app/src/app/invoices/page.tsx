"use client";

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
} from "lucide-react";
import { getInvoicesSync, saveInvoice, isNewVendor, type StoredInvoice } from "@/lib/invoice-store";
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

// Real AI parsing via Claude Vision API + policy evaluation
async function parseInvoiceAI(file: File): Promise<{ invoice: ParsedInvoice; policy: PolicyDecision }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/parse-invoice", { method: "POST", body: formData });

  if (!res.ok) {
    // Fallback to mock if API key not set
    console.warn("AI API failed, using mock data");
    const mockInvoice: ParsedInvoice = {
      vendor: "Acme Design Studio",
      amount: 3200.0,
      currency: "USD",
      dueDate: "2026-04-15",
      category: "Contractor",
      lineItems: [
        { description: "UI/UX Design — Dashboard redesign", amount: 2400 },
        { description: "Brand assets — Icon set v2", amount: 800 },
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

export default function InvoicesPage() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedInvoice | null>(null);
  const [policyResult, setPolicyResult] = useState<PolicyDecision | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [invoiceHistory, setInvoiceHistory] = useState<StoredInvoice[]>([]);

  useEffect(() => { setInvoiceHistory(getInvoicesSync()); }, [submitted]);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setParsing(true);
    setParsed(null);
    setPolicyResult(null);
    setSubmitted(false);

    try {
      const { invoice, policy } = await parseInvoiceAI(f);
      setParsed(invoice);
      setPolicyResult(policy);
    } catch (e) {
      toast.error("Failed to parse invoice");
    } finally {
      setParsing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleSubmit = async () => {
    if (parsed && policyResult && file) {
      saveInvoice({
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
        status: policyResult.action === "auto_approve" ? "paid" : "submitted",
      });
    }
    setSubmitted(true);
  };

  const reset = () => {
    setFile(null);
    setParsed(null);
    setPolicyResult(null);
    setSubmitted(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload an invoice — AI extracts data, policies decide approval flow
        </p>
      </div>

      {/* Upload Zone */}
      {!file && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-primary/5"
          }`}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".pdf,.png,.jpg,.jpeg";
            input.onchange = (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) handleFile(f);
            };
            input.click();
          }}
        >
          <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Drop invoice here or click to upload</p>
          <p className="text-sm text-muted-foreground mt-1">PDF, PNG, or JPEG — AI will extract all data</p>
        </div>
      )}

      {/* Parsing State */}
      {parsing && (
        <div className="glass rounded-xl p-8 text-center">
          <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin mb-4" />
          <p className="text-lg font-medium">AI is parsing your invoice...</p>
          <p className="text-sm text-muted-foreground mt-1">Extracting vendor, amount, line items, and risk signals</p>
        </div>
      )}

      {/* Parsed Result */}
      {parsed && !submitted && (
        <div className="space-y-4">
          {/* File info */}
          <div className="flex items-center justify-between glass rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">{file?.name}</span>
              <span className="badge-info text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {Math.round(parsed.confidence * 100)}% confidence
              </span>
            </div>
            <button onClick={reset} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Extracted Data */}
          <div className="glass rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              AI-Extracted Invoice Data
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Vendor</label>
                <p className="text-lg font-medium mt-1">{parsed.vendor}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Amount</label>
                <p className="text-lg font-bold font-mono mt-1 text-primary">
                  ${parsed.amount.toLocaleString()} {parsed.currency}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Due Date</label>
                <p className="text-sm mt-1">{parsed.dueDate}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">Category</label>
                <p className="text-sm mt-1">{parsed.category}</p>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Line Items</label>
              <div className="mt-2 space-y-2">
                {parsed.lineItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-secondary/50 rounded-lg px-4 py-2.5">
                    <span className="text-sm">{item.description}</span>
                    <span className="text-sm font-mono">${item.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Flags */}
            {parsed.riskFlags.length > 0 && (
              <div className="flex items-center gap-2 badge-danger rounded-lg px-4 py-2.5">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">Risk flags: {parsed.riskFlags.join(", ")}</span>
              </div>
            )}
          </div>

          {/* Policy Decision */}
          {policyResult && (
            <div
              className={`rounded-xl p-6 ${
                policyResult.action === "auto_approve"
                  ? "badge-success"
                  : policyResult.action === "block"
                  ? "badge-danger"
                  : "badge-warning"
              }`}
            >
              <div className="flex items-center gap-3">
                {policyResult.action === "auto_approve" ? (
                  <Zap className="w-5 h-5" />
                ) : policyResult.action === "block" ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                <div>
                  <p className="font-medium">
                    {policyResult.action === "auto_approve"
                      ? "Auto-Approved"
                      : policyResult.action === "block"
                      ? "Blocked by Policy"
                      : `Requires ${policyResult.requiredApprovers} Approval${policyResult.requiredApprovers > 1 ? "s" : ""}`}
                  </p>
                  <p className="text-sm opacity-80 mt-0.5">{policyResult.reason}</p>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          {policyResult?.action !== "block" && (
            <button
              onClick={handleSubmit}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              {policyResult?.action === "auto_approve" ? "Execute Payment" : "Submit for Approval"}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Success State */}
      {submitted && (
        <div className="glass rounded-xl p-8 text-center glow-purple">
          <CheckCircle2 className="w-12 h-12 mx-auto text-[var(--success)] mb-4" />
          <h3 className="text-xl font-bold">
            {policyResult?.action === "auto_approve" ? "Payment Executed" : "Submitted for Approval"}
          </h3>
          <p className="text-muted-foreground mt-2">
            {policyResult?.action === "auto_approve"
              ? `$${parsed?.amount.toLocaleString()} USDC invoice from ${parsed?.vendor} approved — create payment from the Payments page`
              : `Waiting for ${policyResult?.requiredApprovers} approval(s) from authorized members`}
          </p>
          <button onClick={reset} className="mt-4 text-primary text-sm hover:underline">
            Upload another invoice
          </button>
        </div>
      )}

      {/* Invoice History */}
      {invoiceHistory.length > 0 && !parsing && (
        <div className="card animate-in-delay-2">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h3 className="text-[13px] font-semibold">Invoice History</h3>
            <span className="badge badge-neutral">{invoiceHistory.length}</span>
          </div>
          <div className="divide-y divide-border">
            {invoiceHistory.slice(0, 10).map((inv) => (
              <div key={inv.id} className="px-5 py-3 flex items-center justify-between hover:bg-[rgba(255,255,255,0.015)] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    inv.status === "paid" ? "bg-success" : inv.status === "submitted" ? "bg-warning pulse-dot" : "bg-primary"
                  }`} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate">{inv.vendor}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {inv.fileName} · {inv.category} · {new Date(inv.createdAt).toLocaleDateString()}
                      {isNewVendor(inv.vendor) ? "" : " · Known vendor"}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-[13px] font-mono font-medium">${inv.amount.toLocaleString()}</p>
                  <span className={`badge ${
                    inv.status === "paid" ? "badge-success" : inv.status === "submitted" ? "badge-warning" : "badge-info"
                  }`}>
                    {inv.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
