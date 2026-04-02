import type { ParsedInvoice } from "./invoice-parser.js";

export interface PolicyConfig {
  autoApproveLimit: number;     // In USDC lamports (6 decimals)
  dualApproveThreshold: number;
  monthlyBurnCap: number;
  requireVendorVerification: boolean;
  restrictToKnownRecipients: boolean;
  minRunwayMonths: number;
  currentMonthlySpend: number;
}

export interface PolicyDecision {
  action: "auto_approve" | "require_approval" | "require_dual" | "block";
  reason: string;
  requiredApprovers: number;
  flags: string[];
  details: PolicyCheckResult[];
}

interface PolicyCheckResult {
  check: string;
  passed: boolean;
  detail: string;
}

export function evaluatePolicy(
  invoice: ParsedInvoice,
  config: PolicyConfig
): PolicyDecision {
  const amountLamports = invoice.amount * 1_000_000; // Convert to USDC lamports
  const checks: PolicyCheckResult[] = [];
  const flags: string[] = [];

  // Check 1: Monthly burn cap
  const newMonthlyTotal = config.currentMonthlySpend + amountLamports;
  const capCheck = config.monthlyBurnCap === 0 || newMonthlyTotal <= config.monthlyBurnCap;
  checks.push({
    check: "Monthly Burn Cap",
    passed: capCheck,
    detail: capCheck
      ? `$${(newMonthlyTotal / 1_000_000).toLocaleString()} / $${(config.monthlyBurnCap / 1_000_000).toLocaleString()} monthly limit`
      : `Would exceed monthly cap: $${(newMonthlyTotal / 1_000_000).toLocaleString()} > $${(config.monthlyBurnCap / 1_000_000).toLocaleString()}`,
  });

  if (!capCheck) {
    return {
      action: "block",
      reason: "Monthly burn cap would be exceeded",
      requiredApprovers: 0,
      flags: ["BURN_CAP_EXCEEDED"],
      details: checks,
    };
  }

  // Check 2: New vendor verification
  if (config.requireVendorVerification && invoice.riskFlags.includes("new_vendor")) {
    flags.push("NEW_VENDOR");
    checks.push({
      check: "Vendor Verification",
      passed: false,
      detail: "New vendor detected — requires manual approval regardless of amount",
    });

    return {
      action: "require_approval",
      reason: "New vendor requires verification before first payment",
      requiredApprovers: 1,
      flags,
      details: checks,
    };
  }

  checks.push({
    check: "Vendor Verification",
    passed: true,
    detail: "Known vendor or verification not required",
  });

  // Check 3: Amount thresholds
  if (amountLamports <= config.autoApproveLimit) {
    checks.push({
      check: "Amount Threshold",
      passed: true,
      detail: `$${invoice.amount.toLocaleString()} is under auto-approve limit of $${(config.autoApproveLimit / 1_000_000).toLocaleString()}`,
    });

    return {
      action: "auto_approve",
      reason: `Under $${(config.autoApproveLimit / 1_000_000).toLocaleString()} auto-approve threshold`,
      requiredApprovers: 0,
      flags,
      details: checks,
    };
  }

  if (amountLamports > config.dualApproveThreshold) {
    checks.push({
      check: "Amount Threshold",
      passed: true,
      detail: `$${invoice.amount.toLocaleString()} exceeds dual-approval threshold of $${(config.dualApproveThreshold / 1_000_000).toLocaleString()}`,
    });
    flags.push("HIGH_VALUE");

    return {
      action: "require_dual",
      reason: `Over $${(config.dualApproveThreshold / 1_000_000).toLocaleString()} — requires Founder + CFO approval`,
      requiredApprovers: 2,
      flags,
      details: checks,
    };
  }

  // Single approval
  checks.push({
    check: "Amount Threshold",
    passed: true,
    detail: `$${invoice.amount.toLocaleString()} requires single approval`,
  });

  return {
    action: "require_approval",
    reason: "Standard approval required",
    requiredApprovers: 1,
    flags,
    details: checks,
  };
}
