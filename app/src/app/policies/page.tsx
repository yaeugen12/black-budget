"use client";

import { useState, useEffect } from "react";
import {
  Shield,
  Save,
  Zap,
  AlertTriangle,
  Lock,
  CheckCircle2,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { useCompany } from "@/lib/company-context";

interface PolicyConfig {
  autoApproveLimit: number;
  dualApproveThreshold: number;
  monthlyBurnCap: number;
  requireVendorVerification: boolean;
  restrictToKnownRecipients: boolean;
  minRunwayMonths: number;
}

const defaultPolicies: PolicyConfig = {
  autoApproveLimit: 5000,
  dualApproveThreshold: 15000,
  monthlyBurnCap: 75000,
  requireVendorVerification: true,
  restrictToKnownRecipients: false,
  minRunwayMonths: 8,
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PoliciesPage() {
  const { company, setPolicies: setPoliciesOnChain } = useCompany();

  const [policies, setPolicies] = useState<PolicyConfig>(() => {
    if (company) {
      return {
        autoApproveLimit: company.policy.autoApproveLimit.toNumber() / 1_000_000,
        dualApproveThreshold: company.policy.dualApproveThreshold.toNumber() / 1_000_000,
        monthlyBurnCap: company.policy.monthlyBurnCap.toNumber() / 1_000_000,
        requireVendorVerification: company.policy.requireVendorVerification,
        restrictToKnownRecipients: company.policy.restrictToKnownRecipients,
        minRunwayMonths: company.policy.minRunwayMonths,
      };
    }
    return defaultPolicies;
  });

  useEffect(() => {
    if (company) {
      setPolicies({
        autoApproveLimit: company.policy.autoApproveLimit.toNumber() / 1_000_000,
        dualApproveThreshold: company.policy.dualApproveThreshold.toNumber() / 1_000_000,
        monthlyBurnCap: company.policy.monthlyBurnCap.toNumber() / 1_000_000,
        requireVendorVerification: company.policy.requireVendorVerification,
        restrictToKnownRecipients: company.policy.restrictToKnownRecipients,
        minRunwayMonths: company.policy.minRunwayMonths,
      });
    }
  }, [company]);

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await setPoliciesOnChain(policies);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to save policies");
    } finally {
      setSaving(false);
    }
  };

  const singleApproverBand = Math.max(policies.dualApproveThreshold - policies.autoApproveLimit, 0);

  return (
    <div className="page-shell mx-auto max-w-6xl space-y-6 animate-in">
      <section className="card px-6 py-6 lg:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="eyebrow">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Policies
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">Treasury rules</h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted-foreground">
              Set when payments auto-approve, when they need more signers, and how strict the treasury guardrails should be.
            </p>
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary px-4 py-2 text-[13px]">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Policies
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-[12px] text-destructive">
            {error}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="badge badge-info">Auto under {formatCurrency(policies.autoApproveLimit)}</span>
          <span className="badge badge-warning">Dual from {formatCurrency(policies.dualApproveThreshold)}</span>
          <span className="badge badge-neutral">Burn cap {formatCurrency(policies.monthlyBurnCap)}</span>
          <span className="badge badge-neutral">Runway floor {policies.minRunwayMonths} mo</span>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-label mb-1">Approval Thresholds</p>
              <h3 className="section-title">Decide how friction ramps up with payment size</h3>
            </div>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-[13px] font-medium">Auto-approve limit</label>
                <span className="text-[13px] font-medium text-primary">{formatCurrency(policies.autoApproveLimit)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={25000}
                step={500}
                value={policies.autoApproveLimit}
                onChange={(e) => setPolicies({ ...policies, autoApproveLimit: +e.target.value })}
              />
              <p className="mt-2 text-[12px] text-muted-foreground">
                Payments under this amount can move without waiting for manual signatures.
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-[13px] font-medium">Dual-approval threshold</label>
                <span className="text-[13px] font-medium text-primary">{formatCurrency(policies.dualApproveThreshold)}</span>
              </div>
              <input
                type="range"
                min={5000}
                max={100000}
                step={1000}
                value={policies.dualApproveThreshold}
                onChange={(e) => setPolicies({ ...policies, dualApproveThreshold: +e.target.value })}
              />
              <p className="mt-2 text-[12px] text-muted-foreground">
                Large requests escalate into a two-signer flow for stronger treasury controls.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-secondary/40 p-4">
            <p className="text-[13px] font-medium">Approval ladder</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="metric-tile">
                <p className="text-label mb-1">Auto</p>
                <p className="section-title">0 to {formatCurrency(policies.autoApproveLimit)}</p>
              </div>
              <div className="metric-tile">
                <p className="text-label mb-1">Single Signer</p>
                <p className="section-title">{formatCurrency(singleApproverBand)}</p>
              </div>
              <div className="metric-tile">
                <p className="text-label mb-1">Dual Signer</p>
                <p className="section-title">{formatCurrency(policies.dualApproveThreshold)}+</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-label mb-1">Treasury Guardrails</p>
              <h3 className="section-title">Protect the company from overspending its own runway</h3>
            </div>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-[13px] font-medium">Monthly burn cap</label>
                <span className="text-[13px] font-medium text-primary">{formatCurrency(policies.monthlyBurnCap)}</span>
              </div>
              <input
                type="range"
                min={10000}
                max={500000}
                step={5000}
                value={policies.monthlyBurnCap}
                onChange={(e) => setPolicies({ ...policies, monthlyBurnCap: +e.target.value })}
              />
              <p className="mt-2 text-[12px] text-muted-foreground">
                Total monthly outflows should stay inside this envelope.
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-[13px] font-medium">Minimum runway protection</label>
                <span className="text-[13px] font-medium text-primary">{policies.minRunwayMonths} months</span>
              </div>
              <input
                type="range"
                min={0}
                max={24}
                step={1}
                value={policies.minRunwayMonths}
                onChange={(e) => setPolicies({ ...policies, minRunwayMonths: +e.target.value })}
              />
              <p className="mt-2 text-[12px] text-muted-foreground">
                Stored as a treasury signal so off-chain review can stay aligned with runway expectations.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-secondary/40 p-4">
            <p className="text-[13px] font-medium">Guardrail summary</p>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
              Payments should stay within the monthly burn cap and above the runway floor you set here.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-label mb-1">Review Rules</p>
              <h3 className="section-title">Control how strict the approval surface should feel</h3>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] font-medium">Require new vendor verification</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Advisory review rule for finance ops when a wallet or vendor appears for the first time.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPolicies({ ...policies, requireVendorVerification: !policies.requireVendorVerification })
                  }
                  className={`toggle ${policies.requireVendorVerification ? "toggle-on" : "toggle-off"}`}
                >
                  <span className="toggle-knob" />
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] font-medium">Restrict to known recipients</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Advisory safeguard for teams that want tighter control over treasury destinations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPolicies({ ...policies, restrictToKnownRecipients: !policies.restrictToKnownRecipients })
                  }
                  className={`toggle ${policies.restrictToKnownRecipients ? "toggle-on" : "toggle-off"}`}
                >
                  <span className="toggle-knob" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <div>
              <p className="text-label mb-1">Current Effect</p>
              <h3 className="section-title">What this policy set does right now</h3>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3">
              <p className="text-[13px] font-medium">Low-value spend</p>
              <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
                Requests under {formatCurrency(policies.autoApproveLimit)} can move without waiting for manual approval.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3">
              <p className="text-[13px] font-medium">Larger requests</p>
              <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
                Anything from {formatCurrency(policies.dualApproveThreshold)} and up is routed into a dual-approval path.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3">
              <p className="text-[13px] font-medium">Review safeguards</p>
              <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
                Vendor verification is {policies.requireVendorVerification ? "on" : "off"} and recipient restriction is {policies.restrictToKnownRecipients ? "on" : "off"}.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3">
              <p className="text-[13px] font-medium">Treasury discipline</p>
              <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
                Monthly outflow is capped at {formatCurrency(policies.monthlyBurnCap)} with a target floor of {policies.minRunwayMonths} runway months.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
