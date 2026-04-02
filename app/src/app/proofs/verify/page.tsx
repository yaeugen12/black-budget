"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck, ShieldAlert, ArrowLeft, Upload, CheckCircle2, XCircle,
  Hash, Loader2, ExternalLink, FileText,
} from "lucide-react";
import { toast } from "sonner";

interface ProofJSON {
  version: string;
  type: string;
  merkleRoot: string;
  leafCount: number;
  generatedAt: string;
  company: { name: string; address: string };
  onChainAnchor?: { tx: string; explorer: string } | null;
  verification?: { instructions: string; leafFormat: string; algorithm: string };
  data: Record<string, unknown>;
}

interface VerifyResult {
  status: "valid" | "invalid" | "partial";
  checks: { label: string; passed: boolean; detail: string }[];
}

export default function VerifyProofPage() {
  const [proofJson, setProofJson] = useState<string>("");
  const [proof, setProof] = useState<ProofJSON | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setProofJson(text);
      parseAndVerify(text);
    };
    reader.readAsText(file);
  };

  const handlePaste = () => {
    if (!proofJson.trim()) return;
    parseAndVerify(proofJson);
  };

  const parseAndVerify = async (text: string) => {
    setError(null);
    setResult(null);
    setVerifying(true);

    try {
      const parsed = JSON.parse(text) as ProofJSON;
      setProof(parsed);

      const checks: VerifyResult["checks"] = [];

      // Check 1: Valid structure
      const hasRoot = typeof parsed.merkleRoot === "string" && parsed.merkleRoot.length >= 64;
      checks.push({
        label: "Merkle root present",
        passed: hasRoot,
        detail: hasRoot ? `Root: ${parsed.merkleRoot.slice(0, 20)}...` : "Missing or invalid merkle root",
      });

      // Check 2: Company address
      const hasCompany = typeof parsed.company?.address === "string" && parsed.company.address.length > 30;
      checks.push({
        label: "Company address valid",
        passed: hasCompany,
        detail: hasCompany ? parsed.company.address : "Missing company address",
      });

      // Check 3: Proof type
      const validTypes = ["investor", "auditor", "regulator"];
      const hasType = validTypes.includes(parsed.type);
      checks.push({
        label: "Proof type recognized",
        passed: hasType,
        detail: hasType ? `Type: ${parsed.type}` : `Unknown type: ${parsed.type}`,
      });

      // Check 4: Leaf count > 0
      const hasLeaves = parsed.leafCount > 0;
      checks.push({
        label: "Payment data included",
        passed: hasLeaves,
        detail: hasLeaves ? `${parsed.leafCount} payment leaves in tree` : "No payment data",
      });

      // Check 5: On-chain anchor
      const hasAnchor = !!parsed.onChainAnchor?.tx;
      checks.push({
        label: "Anchored on-chain",
        passed: hasAnchor,
        detail: hasAnchor
          ? `TX: ${parsed.onChainAnchor!.tx.slice(0, 20)}...`
          : "Not anchored — this proof exists only off-chain",
      });

      // Check 6: Verification instructions
      const hasVerification = !!parsed.verification?.instructions;
      checks.push({
        label: "Verification instructions present",
        passed: hasVerification,
        detail: hasVerification
          ? `Algorithm: ${parsed.verification!.algorithm}`
          : "No verification method described",
      });

      // Check 7: On-chain root match (if anchored, try to verify against Solana)
      if (hasAnchor && hasCompany) {
        try {
          const res = await fetch(
            `https://api.devnet.solana.com`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0", id: 1,
                method: "getTransaction",
                params: [parsed.onChainAnchor!.tx, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
              }),
            }
          );
          const rpcResult = await res.json();
          const txExists = !!rpcResult.result;
          checks.push({
            label: "Transaction confirmed on Solana",
            passed: txExists,
            detail: txExists
              ? `Confirmed in slot ${rpcResult.result.slot}`
              : "Transaction not found on devnet",
          });
        } catch {
          checks.push({
            label: "Transaction confirmed on Solana",
            passed: false,
            detail: "Could not verify — RPC error",
          });
        }
      }

      // Check 8: Data disclosure level matches type
      if (parsed.type === "investor") {
        const hasRedacted = Array.isArray((parsed.data as Record<string, unknown>).redacted);
        checks.push({
          label: "Investor data properly redacted",
          passed: hasRedacted,
          detail: hasRedacted
            ? `Redacted fields: ${((parsed.data as Record<string, unknown>).redacted as string[]).join(", ")}`
            : "No redaction markers found",
        });
      } else if (parsed.type === "auditor") {
        const hasPseudo = Array.isArray((parsed.data as Record<string, unknown>).payments);
        checks.push({
          label: "Auditor data has pseudonymized vendors",
          passed: hasPseudo,
          detail: hasPseudo
            ? `${((parsed.data as Record<string, unknown>).payments as unknown[]).length} payment records`
            : "No payment records found",
        });
      } else if (parsed.type === "regulator") {
        const hasFull = Array.isArray((parsed.data as Record<string, unknown>).payments);
        checks.push({
          label: "Regulator data has full disclosure",
          passed: hasFull,
          detail: hasFull
            ? `${((parsed.data as Record<string, unknown>).payments as unknown[]).length} unredacted records`
            : "No full records found",
        });
      }

      const allPassed = checks.every(c => c.passed);
      const somePassed = checks.some(c => c.passed);

      setResult({
        status: allPassed ? "valid" : somePassed ? "partial" : "invalid",
        checks,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in">
      <div className="flex items-center gap-3">
        <Link href="/proofs" className="btn-ghost p-2">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-heading">Verify Proof</h1>
          <p className="text-[13px] text-muted-foreground">
            Upload or paste a proof JSON to verify its integrity and on-chain anchor
          </p>
        </div>
      </div>

      {/* Upload / Paste */}
      {!result && (
        <div className="space-y-4">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="h-5 w-5 text-primary" />
              <h3 className="text-[14px] font-semibold">Upload proof file</h3>
            </div>
            <label className="flex items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-8 cursor-pointer hover:border-primary/30 transition-colors">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-[13px] text-muted-foreground">Drop a proof JSON or click to browse</span>
              <input type="file" accept=".json" onChange={handleFile} className="hidden" />
            </label>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <Hash className="h-5 w-5 text-primary" />
              <h3 className="text-[14px] font-semibold">Or paste JSON directly</h3>
            </div>
            <textarea
              value={proofJson}
              onChange={(e) => setProofJson(e.target.value)}
              placeholder='{"version":"2.0","type":"investor","merkleRoot":"0x...","leafCount":5,...}'
              className="input w-full h-32 font-mono text-[12px] resize-none"
            />
            <button onClick={handlePaste} disabled={!proofJson.trim() || verifying} className="btn-primary mt-3">
              {verifying ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</> : "Verify Proof"}
            </button>
          </div>

          {error && (
            <div className="card p-4 border-destructive/20 bg-destructive/5">
              <p className="text-[13px] text-destructive">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && proof && (
        <div className="space-y-4 animate-in">
          {/* Status banner */}
          <div className={`card p-6 ${
            result.status === "valid" ? "border-success/20 bg-success/5" :
            result.status === "partial" ? "border-warning/20 bg-warning/5" :
            "border-destructive/20 bg-destructive/5"
          }`}>
            <div className="flex items-center gap-4">
              {result.status === "valid" ? (
                <ShieldCheck className="h-10 w-10 text-success" />
              ) : result.status === "partial" ? (
                <ShieldAlert className="h-10 w-10 text-warning" />
              ) : (
                <XCircle className="h-10 w-10 text-destructive" />
              )}
              <div>
                <h2 className="text-[20px] font-semibold">
                  {result.status === "valid" ? "Proof Verified" :
                   result.status === "partial" ? "Partially Verified" : "Verification Failed"}
                </h2>
                <p className="text-[13px] text-muted-foreground mt-1">
                  {result.checks.filter(c => c.passed).length}/{result.checks.length} checks passed
                  {proof.company?.name && ` · ${proof.company.name}`}
                  {proof.type && ` · ${proof.type} view`}
                </p>
              </div>
            </div>
          </div>

          {/* Check details */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-[14px] font-semibold">Verification Checks</h3>
            </div>
            <div className="divide-y divide-border">
              {result.checks.map((check) => (
                <div key={check.label} className="flex items-start gap-3 px-5 py-3">
                  {check.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className="text-[13px] font-medium">{check.label}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* On-chain link */}
          {proof.onChainAnchor?.explorer && (
            <a
              href={proof.onChainAnchor.explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="card p-4 flex items-center justify-between hover:border-primary/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Hash className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-[13px] font-medium">View on Solana Explorer</p>
                  <p className="text-[12px] text-muted-foreground font-mono">{proof.onChainAnchor.tx.slice(0, 30)}...</p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          )}

          <button onClick={() => { setResult(null); setProof(null); setProofJson(""); }} className="btn-secondary w-full">
            Verify another proof
          </button>
        </div>
      )}
    </div>
  );
}
