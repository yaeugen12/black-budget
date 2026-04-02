"use client";

import { useState, useEffect } from "react";
import { Shield, Save, Zap, AlertTriangle, Lock, CheckCircle2, Loader2 } from "lucide-react";
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
    } catch (e: any) {
      setError(e.message || "Failed to save policies");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Treasury Policies</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Financial constitution — rules enforced on-chain for every payment
          </p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : saved ? "Saved on-chain ✓" : "Save Policies"}
        </button>
      </div>

      {/* Approval Thresholds */}
      <div className="glass rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Approval Thresholds</h3>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm">Auto-Approve Limit</label>
              <span className="text-sm font-mono text-primary">${policies.autoApproveLimit.toLocaleString()} USDC</span>
            </div>
            <input
              type="range"
              min={0}
              max={25000}
              step={500}
              value={policies.autoApproveLimit}
              onChange={(e) => setPolicies({ ...policies, autoApproveLimit: +e.target.value })}
              className="w-full accent-[var(--primary)]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Payments under this amount execute instantly — no approval needed
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm">Dual-Approval Threshold</label>
              <span className="text-sm font-mono text-primary">${policies.dualApproveThreshold.toLocaleString()} USDC</span>
            </div>
            <input
              type="range"
              min={5000}
              max={100000}
              step={1000}
              value={policies.dualApproveThreshold}
              onChange={(e) => setPolicies({ ...policies, dualApproveThreshold: +e.target.value })}
              className="w-full accent-[var(--primary)]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Above this: requires 2 approvers (e.g., Founder + CFO)
            </p>
          </div>
        </div>

        {/* Visual flow */}
        <div className="flex items-center gap-2 text-xs bg-secondary/50 rounded-lg p-3">
          <span className="badge-success px-2 py-1 rounded">$0 – ${policies.autoApproveLimit.toLocaleString()}</span>
          <span className="text-muted-foreground">→ Auto</span>
          <span className="badge-warning px-2 py-1 rounded">${policies.autoApproveLimit.toLocaleString()} – ${policies.dualApproveThreshold.toLocaleString()}</span>
          <span className="text-muted-foreground">→ 1 approval</span>
          <span className="badge-danger px-2 py-1 rounded">${policies.dualApproveThreshold.toLocaleString()}+</span>
          <span className="text-muted-foreground">→ 2 approvals</span>
        </div>
      </div>

      {/* Spend Controls */}
      <div className="glass rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Spend Controls</h3>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm">Monthly Burn Cap</label>
            <span className="text-sm font-mono text-primary">${policies.monthlyBurnCap.toLocaleString()} USDC</span>
          </div>
          <input
            type="range"
            min={10000}
            max={500000}
            step={5000}
            value={policies.monthlyBurnCap}
            onChange={(e) => setPolicies({ ...policies, monthlyBurnCap: +e.target.value })}
            className="w-full accent-[var(--primary)]"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Total monthly spending cannot exceed this — enforced on-chain
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm">Minimum Runway Protection</label>
            <span className="text-sm font-mono text-primary">{policies.minRunwayMonths} months</span>
          </div>
          <input
            type="range"
            min={0}
            max={24}
            step={1}
            value={policies.minRunwayMonths}
            onChange={(e) => setPolicies({ ...policies, minRunwayMonths: +e.target.value })}
            className="w-full accent-[var(--primary)]"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Advisory — stored on-chain for off-chain enforcement by the rule engine
          </p>
        </div>
      </div>

      {/* Security Rules */}
      <div className="glass rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Security Rules</h3>
        </div>

        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium">Require New Vendor Verification</p>
              <p className="text-xs text-muted-foreground">Advisory — checked off-chain by the rule engine</p>
            </div>
            <div
              onClick={() => setPolicies({ ...policies, requireVendorVerification: !policies.requireVendorVerification })}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                policies.requireVendorVerification ? "bg-primary" : "bg-secondary"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                  policies.requireVendorVerification ? "translate-x-5.5" : "translate-x-0.5"
                }`}
              />
            </div>
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium">Restrict to Known Recipients</p>
              <p className="text-xs text-muted-foreground">Advisory — checked off-chain by the rule engine</p>
            </div>
            <div
              onClick={() => setPolicies({ ...policies, restrictToKnownRecipients: !policies.restrictToKnownRecipients })}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                policies.restrictToKnownRecipients ? "bg-primary" : "bg-secondary"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                  policies.restrictToKnownRecipients ? "translate-x-5.5" : "translate-x-0.5"
                }`}
              />
            </div>
          </label>
        </div>
      </div>

      {/* Policy Summary */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm">
        <div className="flex items-center gap-2 mb-2 text-primary">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-medium">Policy as Code</span>
        </div>
        <p className="text-muted-foreground">
          These rules are stored on-chain in the Company PDA. They cannot be bypassed —
          every payment is validated against them before execution.
          Changes require Owner signature.
        </p>
      </div>
    </div>
  );
}
