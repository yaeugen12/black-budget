"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCompany } from "@/lib/company-context";
import {
  Building2,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Shield,
  Sparkles,
  Zap,
  Lock,
  Eye,
  ExternalLink,
} from "lucide-react";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export function Onboarding() {
  const wallet = useWallet();
  const { initializeCompany, loading } = useCompany();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<"connect" | "create" | "creating" | "done">("connect");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (wallet.connected && step === "connect") setStep("create");
    if (!wallet.connected) setStep("connect");
  }, [wallet.connected, step]);

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
      setError(e.message?.slice(0, 120) || "Failed to create company");
      setStep("create");
    }
  };

  if (!mounted) return null;

  // ─── Connect Wallet ─────────────────────────────────────────────
  if (!wallet.connected) {
    return (
      <div className="flex items-center justify-center min-h-screen px-6">
        <div className="max-w-sm w-full space-y-10 animate-in">
          {/* Brand */}
          <div className="text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto float">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-display text-2xl">Black Budget</h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto leading-relaxed">
                Private finance operating system for internet-native companies
              </p>
            </div>
          </div>

          {/* Features */}
          <div className="space-y-2">
            {[
              { icon: Zap, text: "AI invoice processing with policy enforcement", delay: "animate-in-delay-1" },
              { icon: Shield, text: "Confidential payments — amounts hidden on-chain", delay: "animate-in-delay-2" },
              { icon: Eye, text: "Selective disclosure for investors & auditors", delay: "animate-in-delay-3" },
            ].map(({ icon: Icon, text, delay }) => (
              <div key={text} className={`card flex items-center gap-3 p-3.5 ${delay}`}>
                <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-[13px] text-secondary-foreground/80">{text}</span>
              </div>
            ))}
          </div>

          {/* Connect */}
          <div className="animate-in-delay-4">
            <WalletMultiButton
              style={{
                width: "100%",
                height: "48px",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: "var(--primary)",
                color: "#fff",
                justifyContent: "center",
                boxShadow: "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 16px rgba(139,92,246,0.2)",
              }}
            />
            <p className="text-center text-[11px] text-muted-foreground mt-3">
              Built on Solana  ·  Token-2022  ·  Devnet
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4 animate-in">
          <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Checking on-chain data...</p>
        </div>
      </div>
    );
  }

  // ─── Create Company ─────────────────────────────────────────────
  if (step === "create" || step === "creating") {
    return (
      <div className="flex items-center justify-center min-h-screen px-6">
        <div className="max-w-sm w-full space-y-6 animate-in">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-heading">Create Your Company</h2>
            <p className="text-sm text-muted-foreground">
              Deploy an on-chain treasury with role-based access
            </p>
          </div>

          <div className="card p-5 space-y-4">
            <div>
              <label className="text-label block mb-2">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., Acme Labs"
                maxLength={64}
                disabled={step === "creating"}
                className="input"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>

            <div className="space-y-2 text-[12px] text-muted-foreground">
              {["Token-2022 USDC vault", "Owner role with full permissions", "Default treasury policies", "~0.01 SOL in fees"].map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                  <span>{t}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="badge-danger rounded-lg px-3 py-2.5 text-[12px] leading-relaxed">
                {error}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={!companyName.trim() || step === "creating"}
              className="btn-primary w-full"
            >
              {step === "creating" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating on Solana...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Create Company</>
              )}
            </button>
          </div>

          <p className="text-[11px] text-center text-muted-foreground text-mono">
            {wallet.publicKey?.toBase58().slice(0, 4)}...{wallet.publicKey?.toBase58().slice(-4)}
          </p>
        </div>
      </div>
    );
  }

  // ─── Success ────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="flex items-center justify-center min-h-screen px-6">
        <div className="max-w-sm w-full text-center space-y-6 animate-in">
          <div className="w-16 h-16 rounded-full bg-success/10 border border-success/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <div>
            <h2 className="text-heading">Company Created</h2>
            <p className="text-sm text-muted-foreground mt-1">
              <strong className="text-foreground">{companyName}</strong> is live on Solana Devnet
            </p>
          </div>

          {txSig && (
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="card flex items-center justify-center gap-2 px-4 py-3 text-[12px] text-primary hover:border-primary/30 transition-colors"
            >
              <span className="text-mono">{txSig.slice(0, 24)}...</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          <button
            onClick={() => window.location.reload()}
            className="btn-primary w-full"
          >
            Open Dashboard <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
