import { createHash } from "crypto";

export interface PaymentInput {
  id: number;
  recipient: string;
  amount: number;
  category: string;
  timestamp: number;
  memo?: string;
}

export interface Proof {
  version: string;
  type: "investor" | "auditor" | "regulator";
  merkleRoot: string;
  leafCount: number;
  generatedAt: string;
  period: { start: string; end: string };
  data: Record<string, unknown>;
}

// ─── Merkle Tree ────────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function computeMerkleRoot(payments: PaymentInput[]): { root: string; leafCount: number } {
  if (payments.length === 0) {
    return { root: "0x" + "0".repeat(64), leafCount: 0 };
  }

  const leaves = payments.map((p) =>
    sha256(`${p.id}:${p.recipient}:${p.amount}:${p.category}:${p.timestamp}`)
  );

  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      next.push(sha256(left + right));
    }
    level = next;
  }

  return { root: "0x" + level[0], leafCount: leaves.length };
}

function pseudonymize(address: string): string {
  const hash = sha256("pseudonym:" + address);
  return `Addr-${hash.slice(0, 4).toUpperCase()}`;
}

// ─── Proof Generation (real data) ───────────────────────────────────

export function generateProof(
  type: "investor" | "auditor" | "regulator",
  payments: PaymentInput[],
  context: {
    companyName?: string;
    companyAddress?: string;
    vaultBalance?: number;
    memberCount?: number;
  } = {},
  periodStart?: string,
  periodEnd?: string,
): Proof {
  const { root, leafCount } = computeMerkleRoot(payments);
  const now = new Date().toISOString();

  const base = {
    version: "1.0",
    type,
    merkleRoot: root,
    leafCount,
    generatedAt: now,
    period: {
      start: periodStart || (payments.length > 0 ? new Date(Math.min(...payments.map((p) => p.timestamp)) * 1000).toISOString().split("T")[0] : now),
      end: periodEnd || now.split("T")[0],
    },
  };

  switch (type) {
    case "investor": {
      const totalSpend = payments.reduce((s, p) => s + p.amount, 0) / 1_000_000;
      const categoryBreakdown: Record<string, number> = {};
      for (const p of payments) {
        categoryBreakdown[p.category] = (categoryBreakdown[p.category] || 0) + p.amount / 1_000_000;
      }

      return {
        ...base,
        data: {
          aggregates: {
            totalSpend,
            vaultBalance: context.vaultBalance || 0,
            memberCount: context.memberCount || 0,
            paymentCount: payments.length,
            categoryBreakdown,
          },
          redacted: ["individual_payments", "vendor_names", "payment_amounts", "wallet_addresses"],
        },
      };
    }

    case "auditor": {
      return {
        ...base,
        data: {
          payments: payments.map((p) => ({
            id: `BB-${String(p.id).padStart(3, "0")}`,
            vendor: pseudonymize(p.recipient),
            amount: p.amount / 1_000_000,
            category: p.category,
            date: new Date(p.timestamp * 1000).toISOString().split("T")[0],
          })),
          total: payments.reduce((s, p) => s + p.amount, 0) / 1_000_000,
        },
      };
    }

    case "regulator": {
      return {
        ...base,
        data: {
          payments: payments.map((p) => ({
            id: p.id,
            recipient: p.recipient,
            amount: p.amount / 1_000_000,
            category: p.category,
            timestamp: p.timestamp,
            memo: p.memo || "",
          })),
          total: payments.reduce((s, p) => s + p.amount, 0) / 1_000_000,
          company: context,
        },
      };
    }
  }
}
