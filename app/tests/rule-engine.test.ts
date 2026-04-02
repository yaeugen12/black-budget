import { describe, it, expect } from "vitest";

// ─── Rule Engine (duplicated from server for unit testing) ──────────

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

function evaluatePolicy(invoice: ParsedInvoice, config: {
  autoApproveLimit: number;
  dualApproveThreshold: number;
  monthlyBurnCap: number;
  currentMonthlySpend: number;
  requireVendorVerification: boolean;
}): PolicyDecision {
  const amount = invoice.amount;

  // Monthly cap check
  if (config.monthlyBurnCap > 0 && config.currentMonthlySpend + amount > config.monthlyBurnCap) {
    return { action: "block", reason: "Monthly burn cap exceeded", requiredApprovers: 0 };
  }

  // New vendor check
  if (config.requireVendorVerification && invoice.riskFlags.includes("new_vendor")) {
    return { action: "require_approval", reason: "New vendor requires verification", requiredApprovers: 1 };
  }

  // Amount thresholds
  if (amount <= config.autoApproveLimit) {
    return { action: "auto_approve", reason: `Under $${config.autoApproveLimit} threshold`, requiredApprovers: 0 };
  }
  if (amount > config.dualApproveThreshold) {
    return { action: "require_dual", reason: `Over $${config.dualApproveThreshold}`, requiredApprovers: 2 };
  }
  return { action: "require_approval", reason: "Standard approval", requiredApprovers: 1 };
}

// ─── Tests ──────────────────────────────────────────────────────────

const defaultConfig = {
  autoApproveLimit: 5000,
  dualApproveThreshold: 15000,
  monthlyBurnCap: 75000,
  currentMonthlySpend: 0,
  requireVendorVerification: true,
};

function makeInvoice(overrides: Partial<ParsedInvoice> = {}): ParsedInvoice {
  return {
    vendor: "Test Vendor",
    amount: 1000,
    currency: "USD",
    dueDate: "2026-04-15",
    category: "vendor",
    lineItems: [{ description: "Service", amount: 1000 }],
    riskFlags: [],
    confidence: 0.95,
    ...overrides,
  };
}

describe("Rule Engine — Policy Evaluation", () => {
  describe("Amount thresholds", () => {
    it("auto-approves payments under $5,000", () => {
      const result = evaluatePolicy(makeInvoice({ amount: 3200 }), defaultConfig);
      expect(result.action).toBe("auto_approve");
      expect(result.requiredApprovers).toBe(0);
    });

    it("auto-approves payment at exactly $5,000", () => {
      const result = evaluatePolicy(makeInvoice({ amount: 5000 }), defaultConfig);
      expect(result.action).toBe("auto_approve");
    });

    it("requires single approval for $5,001 - $15,000", () => {
      const result = evaluatePolicy(makeInvoice({ amount: 8000 }), defaultConfig);
      expect(result.action).toBe("require_approval");
      expect(result.requiredApprovers).toBe(1);
    });

    it("requires dual approval over $15,000", () => {
      const result = evaluatePolicy(makeInvoice({ amount: 25000 }), defaultConfig);
      expect(result.action).toBe("require_dual");
      expect(result.requiredApprovers).toBe(2);
    });

    it("requires dual approval at exactly $15,001", () => {
      const result = evaluatePolicy(makeInvoice({ amount: 15001 }), defaultConfig);
      expect(result.action).toBe("require_dual");
    });
  });

  describe("Monthly burn cap", () => {
    it("blocks payment that would exceed monthly cap", () => {
      const result = evaluatePolicy(
        makeInvoice({ amount: 10000 }),
        { ...defaultConfig, currentMonthlySpend: 70000 }
      );
      expect(result.action).toBe("block");
    });

    it("allows payment within monthly cap", () => {
      const result = evaluatePolicy(
        makeInvoice({ amount: 3000 }),
        { ...defaultConfig, currentMonthlySpend: 70000 }
      );
      expect(result.action).toBe("auto_approve");
    });

    it("blocks at exact cap boundary", () => {
      const result = evaluatePolicy(
        makeInvoice({ amount: 5001 }),
        { ...defaultConfig, currentMonthlySpend: 70000 }
      );
      expect(result.action).toBe("block");
    });

    it("ignores cap when set to 0 (unlimited)", () => {
      const result = evaluatePolicy(
        makeInvoice({ amount: 100000 }),
        { ...defaultConfig, monthlyBurnCap: 0, currentMonthlySpend: 999999 }
      );
      expect(result.action).not.toBe("block");
    });
  });

  describe("Vendor verification", () => {
    it("requires approval for new vendors regardless of amount", () => {
      const result = evaluatePolicy(
        makeInvoice({ amount: 100, riskFlags: ["new_vendor"] }),
        defaultConfig
      );
      expect(result.action).toBe("require_approval");
      expect(result.requiredApprovers).toBe(1);
    });

    it("skips vendor check when disabled", () => {
      const result = evaluatePolicy(
        makeInvoice({ amount: 100, riskFlags: ["new_vendor"] }),
        { ...defaultConfig, requireVendorVerification: false }
      );
      expect(result.action).toBe("auto_approve");
    });

    it("ignores new_vendor flag for known vendors", () => {
      const result = evaluatePolicy(
        makeInvoice({ amount: 100, riskFlags: [] }),
        defaultConfig
      );
      expect(result.action).toBe("auto_approve");
    });
  });

  describe("Edge cases", () => {
    it("handles zero amount", () => {
      const result = evaluatePolicy(makeInvoice({ amount: 0 }), defaultConfig);
      expect(result.action).toBe("auto_approve");
    });

    it("blocks very large amount that exceeds monthly cap", () => {
      const result = evaluatePolicy(makeInvoice({ amount: 1_000_000 }), defaultConfig);
      // $1M > $75K monthly cap → blocked
      expect(result.action).toBe("block");
    });

    it("dual-approves large amount within monthly cap", () => {
      const result = evaluatePolicy(
        makeInvoice({ amount: 50_000 }),
        { ...defaultConfig, monthlyBurnCap: 100_000 }
      );
      expect(result.action).toBe("require_dual");
      expect(result.requiredApprovers).toBe(2);
    });

    it("monthly cap check runs before amount thresholds", () => {
      // Even a small payment should be blocked if cap is exceeded
      const result = evaluatePolicy(
        makeInvoice({ amount: 100 }),
        { ...defaultConfig, monthlyBurnCap: 50, currentMonthlySpend: 0 }
      );
      expect(result.action).toBe("block");
    });
  });
});
