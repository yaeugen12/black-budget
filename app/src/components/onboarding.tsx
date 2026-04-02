"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCompany } from "@/lib/company-context";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);
import {
  Wallet,
  Building2,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";

export function Onboarding() {
  const wallet = useWallet();
  const { initializeCompany, loading } = useCompany();

  const [step, setStep] = useState<"connect" | "create" | "creating" | "done">(
    wallet.connected ? "create" : "connect"
  );
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!companyName.trim()) return;
    setStep("creating");
    setError(null);

    try {
      const tx = await initializeCompany(companyName.trim());
      setTxSig(tx);
      setStep("done");
    } catch (e: any) {
      console.error("Create company error:", e);
      setError(e.message || "Failed to create company");
      setStep("create");
    }
  };

  // Not connected
  if (!wallet.connected) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
              <Wallet className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Black Budget</h1>
            <p className="text-muted-foreground">
              The private finance operating system for internet-native companies
            </p>
          </div>

          <div className="space-y-3 text-sm text-left glass rounded-xl p-6">
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-primary shrink-0" />
              <span>AI-powered invoice processing with automatic policy enforcement</span>
            </div>
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-primary shrink-0" />
              <span>Confidential payments on Solana — amounts hidden on-chain</span>
            </div>
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <span>Selective disclosure proofs for investors, auditors, regulators</span>
            </div>
          </div>

          <WalletMultiButton
            style={{
              width: "100%",
              height: "48px",
              borderRadius: "12px",
              fontSize: "15px",
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
              justifyContent: "center",
              fontWeight: 600,
            }}
          />
        </div>
      </div>
    );
  }

  // Loading existing company
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading your company...</p>
        </div>
      </div>
    );
  }

  // Create company
  if (step === "create" || step === "creating") {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Create Your Company</h2>
            <p className="text-sm text-muted-foreground">
              This creates an on-chain treasury vault with role-based access control
            </p>
          </div>

          <div className="glass rounded-xl p-6 space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., Acme Labs"
                maxLength={64}
                disabled={step === "creating"}
                className="w-full bg-secondary rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>This will:</p>
              <ul className="space-y-1 ml-4">
                <li>• Deploy a company vault (Token-2022 USDC)</li>
                <li>• Add you as Owner with full permissions</li>
                <li>• Set default treasury policies</li>
                <li>• Cost ~0.01 SOL in transaction fees</li>
              </ul>
            </div>

            {error && (
              <div className="badge-danger rounded-lg px-4 py-2.5 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={!companyName.trim() || step === "creating"}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {step === "creating" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating on Solana...
                </>
              ) : (
                <>
                  Create Company
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Connected: {wallet.publicKey?.toBase58().slice(0, 8)}...
          </p>
        </div>
      </div>
    );
  }

  // Success
  if (step === "done") {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="max-w-md w-full text-center space-y-6">
          <CheckCircle2 className="w-16 h-16 text-[var(--success)] mx-auto" />
          <div>
            <h2 className="text-2xl font-bold">Company Created!</h2>
            <p className="text-muted-foreground mt-2">
              <strong>{companyName}</strong> is now live on Solana
            </p>
          </div>

          {txSig && (
            <div className="glass rounded-lg px-4 py-3 text-xs">
              <span className="text-muted-foreground">TX: </span>
              <a
                href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-mono"
              >
                {txSig.slice(0, 20)}...
              </a>
            </div>
          )}

          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return null;
}
