"use client";

import { useState, useSyncExternalStore } from "react";
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
  Eye,
  ExternalLink,
  Orbit,
  Wallet,
} from "lucide-react";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const trustPoints = [
  { icon: Zap, text: "AI invoice intake with policy routing" },
  { icon: Shield, text: "On-chain controls for treasury and approvals" },
  { icon: Eye, text: "Selective disclosure for investors and auditors" },
];

const launchSteps = [
  "Connect a Solana wallet on Devnet",
  "Create your company vault",
  "Upload an invoice and route the payment",
];

export function Onboarding() {
  const wallet = useWallet();
  const { initializeCompany, loading } = useCompany();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [phase, setPhase] = useState<"create" | "creating" | "done">("create");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!companyName.trim()) return;
    setPhase("creating");
    setError(null);
    try {
      const tx = await initializeCompany(companyName.trim());
      setTxSig(tx);
      setPhase("done");
    } catch (error: unknown) {
      console.error("Create company error:", error);
      const message = error instanceof Error ? error.message : "Failed to create company";
      setError(message.slice(0, 120));
      setPhase("create");
    }
  };

  if (!mounted) return null;

  if (!wallet.connected) {
    return (
      <div className="min-h-screen px-6 py-10 lg:px-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center">
          <div className="hero-surface grid w-full overflow-hidden lg:grid-cols-[1.1fr_0.9fr]">
            <div className="relative px-7 py-10 lg:px-10 lg:py-12">
              <div className="eyebrow mb-5">
                <Orbit className="h-3.5 w-3.5" />
                Solana Frontier build
              </div>

              <div className="max-w-xl">
                <h1 className="text-4xl font-semibold tracking-tight text-balance lg:text-5xl">
                  Private finance infrastructure with a demo flow people can actually follow.
                </h1>
                <p className="mt-5 max-w-lg text-[15px] leading-7 text-muted-foreground">
                  Black Budget turns invoices, approvals, payroll, and investor reporting into one coherent treasury workflow on Solana.
                </p>
              </div>

              <div className="mt-8 grid gap-3 md:grid-cols-3">
                {trustPoints.map(({ icon: Icon, text }) => (
                  <div key={text} className="metric-tile">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-[12px] leading-5 text-secondary-foreground/85">{text}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 card max-w-md p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="section-title">What the first 3 minutes look like</p>
                    <p className="text-[12px] text-muted-foreground">No setup maze, just one clean path into the demo.</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {launchSteps.map((item, index) => (
                    <div key={item} className="flex items-center gap-3 text-[13px]">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[11px] font-semibold text-foreground">
                        {index + 1}
                      </div>
                      <span className="text-muted-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] px-7 py-10 lg:border-l lg:border-t-0 lg:px-10 lg:py-12">
              <div className="mx-auto max-w-sm">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-[11px] text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" />
                  Wallet required
                </div>
                <h2 className="text-heading text-[26px]">Connect your wallet to open the control room</h2>
                <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
                  Use Phantom or another Solana wallet on Devnet. Once connected, we can create the company vault and treasury controls.
                </p>

                <div className="mt-8 card p-5">
                  <p className="text-label mb-3">Connect Wallet</p>
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
                    }}
                  />
                  <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
                    Demo environment: Solana Devnet, Token-2022 USDC, simulated business workflow.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="hero-surface w-full max-w-md p-8 text-center animate-in">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
          <p className="mt-4 text-[14px] text-muted-foreground">Checking on-chain company state...</p>
        </div>
      </div>
    );
  }

  if (phase === "create" || phase === "creating") {
    return (
      <div className="min-h-screen px-6 py-10 lg:px-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center">
          <div className="hero-surface grid w-full overflow-hidden lg:grid-cols-[0.95fr_1.05fr]">
            <div className="px-7 py-10 lg:px-10 lg:py-12">
              <div className="eyebrow mb-5">
                <Building2 className="h-3.5 w-3.5" />
                Company setup
              </div>
              <h2 className="text-3xl font-semibold tracking-tight lg:text-4xl">
                Create the treasury workspace your demo will run on.
              </h2>
              <p className="mt-4 max-w-md text-[14px] leading-6 text-muted-foreground">
                This deploys your company account, Token-2022 vault, founder role, and default policy skeleton on Solana.
              </p>

              <div className="mt-8 space-y-3">
                {[
                  "Token-2022 USDC vault ready for deposits",
                  "Founder role with full control",
                  "Clean base state for approvals, invoices, and proofs",
                  "Single on-chain transaction, visible on Explorer",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-[13px] text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border/80 px-7 py-10 lg:border-l lg:border-t-0 lg:px-10 lg:py-12">
              <div className="card p-6">
                <p className="text-label mb-3">Create Company</p>
                <label className="mb-2 block text-[13px] font-medium text-foreground">Company name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Labs"
                  maxLength={64}
                  disabled={phase === "creating"}
                  className="input"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  autoFocus
                />

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="metric-tile">
                    <p className="text-label mb-1">Network</p>
                    <p className="section-title">Solana Devnet</p>
                  </div>
                  <div className="metric-tile">
                    <p className="text-label mb-1">Estimated Fee</p>
                    <p className="section-title">~0.01 SOL</p>
                  </div>
                </div>

                {error && (
                  <div className="mt-5 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-[12px] leading-relaxed text-destructive">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleCreate}
                  disabled={!companyName.trim() || phase === "creating"}
                  className="btn-primary mt-6 w-full"
                >
                  {phase === "creating" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Creating on Solana...</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> Create Company</>
                  )}
                </button>
              </div>

              <p className="mt-4 text-[11px] text-muted-foreground text-mono">
                Connected wallet: {wallet.publicKey?.toBase58().slice(0, 4)}...{wallet.publicKey?.toBase58().slice(-4)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="hero-surface w-full max-w-2xl overflow-hidden">
          <div className="px-7 py-10 text-center lg:px-10 lg:py-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-success/20 bg-success/10">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <div className="eyebrow mt-6">
              <Shield className="h-3.5 w-3.5" />
              Treasury deployed
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight">Your workspace is live on Devnet.</h2>
            <p className="mx-auto mt-4 max-w-lg text-[14px] leading-6 text-muted-foreground">
              <strong className="text-foreground">{companyName}</strong> now has a company account, founder role, and Token-2022 vault ready for the rest of the demo.
            </p>

            {txSig && (
              <a
                href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="card mx-auto mt-7 flex max-w-md items-center justify-center gap-2 px-4 py-3 text-[12px] text-primary hover:border-primary/30 transition-colors"
              >
                <span className="text-mono">{txSig.slice(0, 24)}...</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            <button
              onClick={() => window.location.reload()}
              className="btn-primary mt-7 min-w-[220px]"
            >
              Open Dashboard <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
