import { createHash } from "crypto";

export interface Proof {
  type: "investor" | "auditor" | "regulator";
  period: { start: string; end: string };
  generatedAt: string;
  merkleRoot: string;
  data: InvestorProofData | AuditorProofData | RegulatorProofData;
}

interface InvestorProofData {
  aggregates: {
    totalSpend: number;
    burnRate: number;
    runway: number;
    treasuryBalance: number;
    teamSize: number;
    categoryBreakdown: Record<string, number>;
  };
  redacted: string[];
}

interface AuditorProofData {
  payments: {
    id: string;
    vendor: string; // Pseudonymized
    amount: number;
    category: string;
    date: string;
  }[];
  totals: Record<string, number>;
}

interface RegulatorProofData {
  requiresMultisig: true;
  signaturesRequired: number;
  signaturesCollected: number;
}

// Mock payment data (in production: read from on-chain + DB)
const mockPayments = [
  { id: "BB-001", vendor: "Acme Design Studio", amount: 3200, category: "contractor", date: "2026-03-28" },
  { id: "BB-002", vendor: "Amazon Web Services", amount: 12800, category: "subscription", date: "2026-03-26" },
  { id: "BB-003", vendor: "Team Payroll", amount: 28500, category: "payroll", date: "2026-03-25" },
  { id: "BB-004", vendor: "Baker & McKenzie LLP", amount: 7500, category: "vendor", date: "2026-03-24" },
  { id: "BB-005", vendor: "Figma Inc.", amount: 45, category: "subscription", date: "2026-03-22" },
  { id: "BB-006", vendor: "Vercel Inc.", amount: 320, category: "subscription", date: "2026-03-20" },
  { id: "BB-007", vendor: "Contract Dev", amount: 4800, category: "contractor", date: "2026-03-18" },
];

function pseudonymize(vendor: string): string {
  const hash = createHash("sha256").update(vendor).digest("hex");
  return `Vendor-${hash.slice(0, 4).toUpperCase()}`;
}

function computeMerkleRoot(payments: typeof mockPayments): string {
  const leaves = payments.map((p) =>
    createHash("sha256")
      .update(`${p.id}:${p.vendor}:${p.amount}:${p.date}`)
      .digest("hex")
  );

  // Simplified merkle (in production: proper binary tree)
  let current = leaves;
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1] || left;
      next.push(createHash("sha256").update(left + right).digest("hex"));
    }
    current = next;
  }

  return `0x${current[0].slice(0, 8)}...${current[0].slice(-4)}`;
}

export function generateProof(
  type: "investor" | "auditor" | "regulator",
  periodStart?: string,
  periodEnd?: string
): Proof {
  const merkleRoot = computeMerkleRoot(mockPayments);
  const now = new Date().toISOString();

  const base = {
    type,
    period: {
      start: periodStart || "2026-03-01",
      end: periodEnd || "2026-03-31",
    },
    generatedAt: now,
    merkleRoot,
  };

  switch (type) {
    case "investor": {
      const totalSpend = mockPayments.reduce((s, p) => s + p.amount, 0);
      const categoryBreakdown: Record<string, number> = {};
      for (const p of mockPayments) {
        categoryBreakdown[p.category] = (categoryBreakdown[p.category] || 0) + p.amount;
      }

      return {
        ...base,
        data: {
          aggregates: {
            totalSpend,
            burnRate: totalSpend, // Monthly
            runway: 284750 / totalSpend,
            treasuryBalance: 284750,
            teamSize: 8,
            categoryBreakdown,
          },
          redacted: [
            "individual_payments",
            "vendor_names",
            "payment_amounts",
            "wallet_addresses",
            "invoice_details",
          ],
        },
      };
    }

    case "auditor": {
      const payments = mockPayments.map((p) => ({
        id: p.id,
        vendor: pseudonymize(p.vendor), // Key difference: pseudonymized
        amount: p.amount,
        category: p.category,
        date: p.date,
      }));

      const totals: Record<string, number> = {};
      for (const p of mockPayments) {
        totals[p.category] = (totals[p.category] || 0) + p.amount;
      }
      totals["total"] = mockPayments.reduce((s, p) => s + p.amount, 0);

      return {
        ...base,
        data: { payments, totals },
      };
    }

    case "regulator":
      return {
        ...base,
        data: {
          requiresMultisig: true,
          signaturesRequired: 2,
          signaturesCollected: 0,
        },
      };
  }
}
