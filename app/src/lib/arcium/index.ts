/**
 * Confidential policy client for the Black Budget frontend.
 *
 * This module wraps `@arcium-hq/client` so React components can issue
 * encrypted policy evaluations against the deployed `confidential_policy`
 * Anchor program without re-deriving keypairs, account contexts, and
 * Rescue cipher state on every call.
 *
 * Feature flag: set `NEXT_PUBLIC_ENABLE_CONFIDENTIAL=true` in `.env.local` to
 * activate. When the flag is off, `useConfidentialPolicy()` returns
 * `{ enabled: false, evaluate: null }` and callers fall back to the plaintext
 * policy evaluation in the main `black_budget` program.
 *
 * Browser-side encryption key:
 * Unlike the test wrapper in arcium-integration/client/ (which uses raw Keypair),
 * the frontend has only a wallet adapter — no access to the secret key. We use
 * `signMessage()` to produce a deterministic x25519 keypair, recoverable from
 * the same wallet on any device. This is the standard Arcium SDK pattern for
 * browser apps.
 */

import { Program, AnchorProvider, BN, type Idl } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { randomBytes, createHash } from "crypto";
import nacl from "tweetnacl";
import { useCallback, useMemo } from "react";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getCompDefAccAddress,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  getMXEPublicKey,
  RescueCipher,
  deserializeLE,
  x25519,
} from "@arcium-hq/client";
import idlJson from "./idl.json";
import type { ConfidentialPolicy } from "./types";

// ── Feature flag + program-ID config ──────────────────────────────────────

export const CONFIDENTIAL_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_CONFIDENTIAL_PROGRAM_ID ??
    // Pre-deploy localnet keypair (replace after `arcium deploy --cluster devnet`)
    "EJphDwZdNmD972zPBjH3phvUga9Gamv21R1usMoQ4A6X"
);

export const CONFIDENTIAL_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_CONFIDENTIAL === "true";

const ENCRYPTION_KEY_MESSAGE = "black-budget-arcium-encryption-key-v1";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ConfidentialPaymentRequest {
  amount: bigint;
  category: number;
  riskScore: number;
}

export interface PolicyDecision {
  requiredApprovals: number; // 0/1/2 or 255 (REJECTED)
  projectedMonthlySpent: bigint;
}

// ── Wallet-adapter signMessage key derivation ────────────────────────────

/**
 * Derive a deterministic X25519 keypair from a wallet's `signMessage`.
 *
 * The user signs a fixed message once per session; we hash the signature to
 * produce a stable x25519 private key. Same wallet, same key, every time —
 * no separate backup, full recovery from the wallet alone.
 */
export async function deriveEncryptionKeyViaWallet(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
  const messageBytes = new TextEncoder().encode(ENCRYPTION_KEY_MESSAGE);
  const signature = await signMessage(messageBytes);
  const privateKey = new Uint8Array(
    createHash("sha256").update(Buffer.from(signature)).digest()
  );
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

// ── PDA helpers ───────────────────────────────────────────────────────────

export function policyPda(companyId: Uint8Array): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), Buffer.from(companyId)],
    CONFIDENTIAL_PROGRAM_ID
  );
  return pda;
}

export function decisionPda(companyId: Uint8Array, paymentId: bigint): PublicKey {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(paymentId);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("decision"), Buffer.from(companyId), idBuf],
    CONFIDENTIAL_PROGRAM_ID
  );
  return pda;
}

// ── Account address builder ──────────────────────────────────────────────

function buildArciumAccounts(computationOffset: BN) {
  const env = getArciumEnv();
  return {
    computationAccount: getComputationAccAddress(env.arciumClusterOffset, computationOffset),
    clusterAccount: getClusterAccAddress(env.arciumClusterOffset),
    mxeAccount: getMXEAccAddress(CONFIDENTIAL_PROGRAM_ID),
    mempoolAccount: getMempoolAccAddress(env.arciumClusterOffset),
    executingPool: getExecutingPoolAccAddress(env.arciumClusterOffset),
  };
}

function compDefAddress(ixName: string): PublicKey {
  return getCompDefAccAddress(
    CONFIDENTIAL_PROGRAM_ID,
    Buffer.from(getCompDefAccOffset(ixName)).readUInt32LE()
  );
}

// ── React hook ────────────────────────────────────────────────────────────

/**
 * React hook that exposes a `evaluate({...})` function for confidential policy
 * evaluation. When the feature flag is off, returns `{ enabled: false, evaluate: null }`.
 *
 * Usage in app/:
 *   const { enabled, evaluate } = useConfidentialPolicy();
 *   if (enabled && evaluate) {
 *     const decision = await evaluate({ companyId, paymentId, amount, category, riskScore });
 *     // decision.requiredApprovals === 0|1|2|255
 *   } else {
 *     // fall through to plaintext create_payment in black_budget program
 *   }
 */
export function useConfidentialPolicy() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const program = useMemo(() => {
    if (!CONFIDENTIAL_ENABLED || !wallet.publicKey) return null;
    const provider = new AnchorProvider(
      connection,
      wallet as any, // wallet-adapter is compatible enough at runtime
      { commitment: "confirmed", preflightCommitment: "confirmed" }
    );
    return new Program(idlJson as Idl, provider) as unknown as Program<ConfidentialPolicy>;
  }, [connection, wallet]);

  const evaluate = useCallback(
    async (args: {
      companyId: Uint8Array;
      paymentId: bigint;
      request: ConfidentialPaymentRequest;
    }): Promise<PolicyDecision> => {
      if (!CONFIDENTIAL_ENABLED) {
        throw new Error("Confidential policy disabled (set NEXT_PUBLIC_ENABLE_CONFIDENTIAL=true)");
      }
      if (!program || !wallet.publicKey || !wallet.signMessage) {
        throw new Error("Wallet not connected or doesn't support signMessage");
      }

      // 1. Derive deterministic x25519 keypair from wallet
      const { privateKey, publicKey: clientPubKey } =
        await deriveEncryptionKeyViaWallet(wallet.signMessage);

      // 2. Fetch MXE pubkey + derive shared secret
      const mxePub = await getMXEPublicKey(
        program.provider as AnchorProvider,
        CONFIDENTIAL_PROGRAM_ID
      );
      if (!mxePub) throw new Error("MXE pubkey unavailable — is the cluster online?");

      const sharedSecret = x25519.getSharedSecret(privateKey, mxePub);
      const cipher = new RescueCipher(sharedSecret);

      // 3. Encrypt the request payload
      const nonce = randomBytes(16);
      const plaintext = [
        args.request.amount,
        BigInt(args.request.category),
        BigInt(args.request.riskScore),
      ];
      const cts = cipher.encrypt(plaintext, nonce);

      // 4. Submit the queue_computation instruction
      const computationOffset = new BN(randomBytes(8), "hex");
      const arc = buildArciumAccounts(computationOffset);
      const policyAcc = policyPda(args.companyId);
      const decisionAcc = decisionPda(args.companyId, args.paymentId);

      await (program.methods as any)
        .evaluatePolicy(
          computationOffset,
          new BN(args.paymentId.toString()),
          Array.from(clientPubKey),
          new BN(deserializeLE(nonce).toString()),
          Array.from(cts[0]),
          Array.from(cts[1]),
          Array.from(cts[2])
        )
        .accountsPartial({
          payer: wallet.publicKey,
          compDefAccount: compDefAddress("evaluate_policy"),
          policyAcc,
          decisionAcc,
          ...arc,
        })
        .rpc({ skipPreflight: true, commitment: "confirmed" });

      // 5. Wait for MPC finalisation, fetch + decrypt decision
      await awaitComputationFinalization(
        program.provider as AnchorProvider,
        computationOffset,
        CONFIDENTIAL_PROGRAM_ID,
        "confirmed"
      );

      const decisionAccount: any = await (program.account as any).policyDecisionAccount.fetch(
        decisionAcc
      );

      const nonceBytes = bnToBytes16LE(decisionAccount.decisionNonce);
      const plaintexts = cipher.decrypt(
        [
          Array.from(decisionAccount.encryptedDecision[0]) as number[],
          Array.from(decisionAccount.encryptedDecision[1]) as number[],
        ] as any,
        nonceBytes as any
      );

      const mask = BigInt(255);
      return {
        requiredApprovals: Number(plaintexts[0] & mask),
        projectedMonthlySpent: plaintexts[1],
      };
    },
    [program, wallet]
  );

  return {
    enabled: CONFIDENTIAL_ENABLED && !!program,
    programId: CONFIDENTIAL_PROGRAM_ID,
    evaluate: CONFIDENTIAL_ENABLED && program ? evaluate : null,
  };
}

function bnToBytes16LE(bn: BN): Uint8Array {
  const buf = Buffer.alloc(16);
  const arr = bn.toArray("le", 16);
  Buffer.from(arr).copy(buf);
  return new Uint8Array(buf);
}
