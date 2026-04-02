/**
 * Programmable Compliance Proofs — Query Engine
 *
 * Evaluates parametric queries against on-chain payment data
 * and generates deterministic constraint hashes for on-chain anchoring.
 */

// ─── Types ──────────────────────────────────────────────────────────

export type Operator = ">" | ">=" | "<" | "<=" | "==" | "!=";

export interface RunwayConstraint {
  kind: "runway";
  operator: Operator;
  months: number;
}

export interface CategoryCapConstraint {
  kind: "category_cap";
  category: string;
  operator: Operator;
  percent: number;
}

export interface TotalSpendConstraint {
  kind: "total_spend";
  operator: Operator;
  amount: number; // in USD
}

export interface VendorConcentrationConstraint {
  kind: "vendor_concentration";
  operator: Operator;
  percent: number;
}

export interface PaymentCountConstraint {
  kind: "payment_count";
  operator: Operator;
  count: number;
}

export type Constraint =
  | RunwayConstraint
  | CategoryCapConstraint
  | TotalSpendConstraint
  | VendorConcentrationConstraint
  | PaymentCountConstraint;

export interface ComplianceQuery {
  name: string;
  description: string;
  constraints: Constraint[];
  // All constraints must pass (AND logic)
}

export interface ConstraintResult {
  constraint: Constraint;
  passed: boolean;
  actualValue: number;
  threshold: number;
  label: string;
}

export interface ComplianceResult {
  query: ComplianceQuery;
  passed: boolean; // all constraints passed
  results: ConstraintResult[];
  constraintHash: string; // hex SHA-256 of canonical query
  merkleRoot: string;
  paymentCount: number;
  evaluatedAt: number; // unix timestamp
}

// ─── Dataset for evaluation ─────────────────────────────────────────

export interface ComplianceDataset {
  payments: Array<{
    amount: number; // in USDC lamports
    category: string;
    recipient: string;
  }>;
  vaultBalance: number; // in human-readable USD
  monthlySpent: number; // in human-readable USD
  totalSpent: number;   // in human-readable USD
  merkleRoot: string;
}

// ─── Constraint Hash (deterministic) ────────────────────────────────

function canonicalJSON(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJSON).join(",") + "]";
  if (typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalJSON((obj as Record<string, unknown>)[k])).join(",") + "}";
  }
  return String(obj);
}

export async function computeConstraintHash(query: ComplianceQuery): Promise<string> {
  // Hash only the constraints (not name/description — those are cosmetic)
  const canonical = canonicalJSON(query.constraints);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(canonical));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Evaluation ─────────────────────────────────────────────────────

function compare(actual: number, op: Operator, threshold: number): boolean {
  switch (op) {
    case ">": return actual > threshold;
    case ">=": return actual >= threshold;
    case "<": return actual < threshold;
    case "<=": return actual <= threshold;
    case "==": return actual === threshold;
    case "!=": return actual !== threshold;
  }
}

function evaluateConstraint(c: Constraint, data: ComplianceDataset): ConstraintResult {
  switch (c.kind) {
    case "runway": {
      const runway = data.monthlySpent > 0 ? data.vaultBalance / data.monthlySpent : Infinity;
      return {
        constraint: c,
        passed: compare(runway, c.operator, c.months),
        actualValue: Math.round(runway * 10) / 10,
        threshold: c.months,
        label: `Runway ${c.operator} ${c.months} months`,
      };
    }
    case "category_cap": {
      const totalAmount = data.payments.reduce((s, p) => s + p.amount, 0);
      const categoryAmount = data.payments
        .filter(p => p.category === c.category)
        .reduce((s, p) => s + p.amount, 0);
      const pct = totalAmount > 0 ? (categoryAmount / totalAmount) * 100 : 0;
      return {
        constraint: c,
        passed: compare(pct, c.operator, c.percent),
        actualValue: Math.round(pct * 10) / 10,
        threshold: c.percent,
        label: `${c.category} spend ${c.operator} ${c.percent}%`,
      };
    }
    case "total_spend": {
      const total = data.totalSpent;
      return {
        constraint: c,
        passed: compare(total, c.operator, c.amount),
        actualValue: total,
        threshold: c.amount,
        label: `Total spend ${c.operator} $${c.amount.toLocaleString()}`,
      };
    }
    case "vendor_concentration": {
      const vendorTotals: Record<string, number> = {};
      let total = 0;
      for (const p of data.payments) {
        vendorTotals[p.recipient] = (vendorTotals[p.recipient] || 0) + p.amount;
        total += p.amount;
      }
      const maxVendorPct = total > 0
        ? Math.max(...Object.values(vendorTotals).map(v => (v / total) * 100))
        : 0;
      return {
        constraint: c,
        passed: compare(maxVendorPct, c.operator, c.percent),
        actualValue: Math.round(maxVendorPct * 10) / 10,
        threshold: c.percent,
        label: `Max vendor concentration ${c.operator} ${c.percent}%`,
      };
    }
    case "payment_count": {
      const count = data.payments.length;
      return {
        constraint: c,
        passed: compare(count, c.operator, c.count),
        actualValue: count,
        threshold: c.count,
        label: `Payment count ${c.operator} ${c.count}`,
      };
    }
  }
}

export async function evaluateCompliance(
  query: ComplianceQuery,
  data: ComplianceDataset,
): Promise<ComplianceResult> {
  const results = query.constraints.map(c => evaluateConstraint(c, data));
  const constraintHash = await computeConstraintHash(query);

  return {
    query,
    passed: results.every(r => r.passed),
    results,
    constraintHash,
    merkleRoot: data.merkleRoot,
    paymentCount: data.payments.length,
    evaluatedAt: Math.floor(Date.now() / 1000),
  };
}

// ─── Templates ──────────────────────────────────────────────────────

export const COMPLIANCE_TEMPLATES: ComplianceQuery[] = [
  {
    name: "Investor Health Check",
    description: "Runway > 6 months, no single vendor > 40% of spend",
    constraints: [
      { kind: "runway", operator: ">", months: 6 },
      { kind: "vendor_concentration", operator: "<", percent: 40 },
    ],
  },
  {
    name: "Burn Rate Discipline",
    description: "Admin & subscription spend under 30% of total",
    constraints: [
      { kind: "category_cap", category: "subscription", operator: "<", percent: 30 },
    ],
  },
  {
    name: "Regulatory Threshold",
    description: "Total spend under $500,000 in the period",
    constraints: [
      { kind: "total_spend", operator: "<", amount: 500_000 },
    ],
  },
  {
    name: "Vendor Diversification",
    description: "No single vendor received more than 25% of total payments",
    constraints: [
      { kind: "vendor_concentration", operator: "<", percent: 25 },
      { kind: "payment_count", operator: ">=", count: 3 },
    ],
  },
];
