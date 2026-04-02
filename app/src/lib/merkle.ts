/**
 * Client-side Merkle tree for selective disclosure proofs.
 * Uses Web Crypto API (SHA-256) — works in browser, no Node dependencies.
 */

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface MerkleLeaf {
  paymentId: number;
  recipient: string;
  amount: number;
  category: string;
  timestamp: number;
}

/**
 * Compute Merkle root from payment leaves.
 * Each leaf is SHA-256(paymentId:recipient:amount:category:timestamp)
 */
export async function computeMerkleRoot(leaves: MerkleLeaf[]): Promise<{
  root: string;
  leafHashes: string[];
  leafCount: number;
}> {
  if (leaves.length === 0) {
    return { root: "0x" + "0".repeat(64), leafHashes: [], leafCount: 0 };
  }

  // Hash each leaf
  const leafHashes = await Promise.all(
    leaves.map((l) =>
      sha256(`${l.paymentId}:${l.recipient}:${l.amount}:${l.category}:${l.timestamp}`)
    )
  );

  // Build tree bottom-up
  let level = [...leafHashes];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left; // duplicate last if odd
      next.push(await sha256(left + right));
    }
    level = next;
  }

  return {
    root: "0x" + level[0],
    leafHashes,
    leafCount: leaves.length,
  };
}

/**
 * Convert a 32-byte hex string into a byte array.
 */
export function hexToBytes32(hex: string): number[] {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;

  if (normalized.length !== 64) {
    throw new Error("Merkle root must be exactly 32 bytes");
  }

  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error("Merkle root must be valid hex");
  }

  return Array.from({ length: 32 }, (_, i) =>
    parseInt(normalized.slice(i * 2, i * 2 + 2), 16)
  );
}

/**
 * Pseudonymize a wallet address — deterministic but irreversible
 */
export async function pseudonymize(address: string): Promise<string> {
  const hash = await sha256("pseudonym:" + address);
  return `Addr-${hash.slice(0, 4).toUpperCase()}`;
}

/**
 * Format a full merkle root as abbreviated string
 */
export function abbreviateHash(hash: string): string {
  if (hash.length < 16) return hash;
  return hash.slice(0, 10) + "..." + hash.slice(-4);
}
