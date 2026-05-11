/**
 * Arcium client wrapper for Black Budget — Phase A.
 *
 * Provides high-level helpers around the confidential-policy program:
 *   - initCompanyPolicyConfidential
 *   - createPaymentConfidential   (encrypted policy evaluation)
 *   - commitPaymentSpendConfidential
 *   - resetMonthlySpendConfidential
 *   - updatePolicyLimitsConfidential
 *
 * These call into the `confidential_policy` Anchor program (see
 * `arcium-integration/programs/confidential_policy/src/lib.rs`) and handle:
 *   - client-side x25519 keypair derivation (deterministic from wallet)
 *   - shared-secret + Rescue cipher init against the MXE
 *   - argument encryption for each circuit
 *   - awaiting MPC finalization + decrypting the encrypted return value
 *
 * This file does not run until the Arcium SDK is installed and the
 * confidential-policy program is deployed. See repo-root `BUILD_ARCIUM.md`
 * for the bring-online sequence.
 */

import * as anchor from "@coral-xyz/anchor";
import type { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { randomBytes, createHash } from "crypto";
import nacl from "tweetnacl";
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

// ─── Types matching the Arcis circuits ────────────────────────────────────

/** Plaintext shape — encrypted before submission. Mirrors `PaymentRequest` in the circuit. */
export interface ConfidentialPaymentRequest {
  amount: bigint;        // USDC base units (6 decimals)
  category: number;      // u8 enum
  riskScore: number;     // u8 (0-100)
}

/** Plaintext shape — encrypted before submission. Mirrors `CompanyPolicy` initial values. */
export interface ConfidentialPolicyInitial {
  autoApproveLimit: bigint;
  dualApproveThreshold: bigint;
  monthlyBurnCap: bigint;
  monthlySpent: bigint;
}

/** Decrypted policy decision returned from the MXE. */
export interface PolicyDecision {
  requiredApprovals: number;       // 0 / 1 / 2 / 255 (sentinel = REJECTED)
  projectedMonthlySpent: bigint;   // post-payment running total
}

const ENCRYPTION_KEY_MESSAGE = "black-budget-arcium-encryption-key-v1";

// ─── Deterministic encryption key derivation ──────────────────────────────

/**
 * Derive a deterministic X25519 keypair from a Solana wallet.
 *
 * Signing a fixed message with the wallet's Ed25519 key yields a stable
 * source of entropy from which we derive an X25519 private key (via SHA256).
 * Users can recover their encryption keys from any device using only the
 * wallet — there is no separate key to back up.
 */
export function deriveEncryptionKey(
  wallet: Keypair
): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const messageBytes = new TextEncoder().encode(ENCRYPTION_KEY_MESSAGE);
  const signature = nacl.sign.detached(messageBytes, wallet.secretKey);
  const privateKey = new Uint8Array(
    createHash("sha256").update(signature).digest()
  );
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

// ─── Shared cipher init ───────────────────────────────────────────────────

interface CipherContext {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  sharedSecret: Uint8Array;
  cipher: RescueCipher;
}

async function buildCipherContext(
  wallet: Keypair,
  provider: AnchorProvider,
  programId: PublicKey,
  maxRetries = 5
): Promise<CipherContext> {
  const { privateKey, publicKey } = deriveEncryptionKey(wallet);

  // The MXE x25519 pubkey may not be available immediately after init.
  let mxePublicKey: Uint8Array | null = null;
  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt < maxRetries) {
    try {
      mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) break;
    } catch (err) {
      lastErr = err;
    }
    attempt += 1;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!mxePublicKey) {
    throw new Error(
      `Could not fetch MXE x25519 pubkey after ${maxRetries} attempts. ` +
        `Last error: ${String(lastErr)}`
    );
  }

  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);
  return { privateKey, publicKey, sharedSecret, cipher };
}

// ─── Account address builder ──────────────────────────────────────────────

interface ArciumAccounts {
  computationAccount: PublicKey;
  clusterAccount: PublicKey;
  mxeAccount: PublicKey;
  mempoolAccount: PublicKey;
  executingPool: PublicKey;
}

function buildArciumAccounts(
  programId: PublicKey,
  computationOffset: anchor.BN
): ArciumAccounts {
  const env = getArciumEnv();
  return {
    computationAccount: getComputationAccAddress(env.arciumClusterOffset, computationOffset),
    clusterAccount: getClusterAccAddress(env.arciumClusterOffset),
    mxeAccount: getMXEAccAddress(programId),
    mempoolAccount: getMempoolAccAddress(env.arciumClusterOffset),
    executingPool: getExecutingPoolAccAddress(env.arciumClusterOffset),
  };
}

function compDefAddress(programId: PublicKey, name: string): PublicKey {
  return getCompDefAccAddress(
    programId,
    Buffer.from(getCompDefAccOffset(name)).readUInt32LE()
  );
}

// ─── PDA helpers ──────────────────────────────────────────────────────────

export function policyPda(programId: PublicKey, companyId: Uint8Array): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), Buffer.from(companyId)],
    programId
  );
  return pda;
}

export function decisionPda(
  programId: PublicKey,
  companyId: Uint8Array,
  paymentId: bigint
): PublicKey {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(paymentId);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("decision"), Buffer.from(companyId), idBuf],
    programId
  );
  return pda;
}

// ═══ 1. INIT COMPANY POLICY ════════════════════════════════════════════════

/**
 * Initialise MXE-owned encrypted policy for a company.
 *
 * Returns the policy PDA + a tx signature once the MPC finalisation event
 * fires (typical wall-clock: 5-15s on devnet).
 */
export async function initCompanyPolicyConfidential(args: {
  program: Program;
  provider: AnchorProvider;
  ownerWallet: Keypair;
  companyId: Uint8Array; // 32 bytes
  initial: ConfidentialPolicyInitial;
}): Promise<{ signature: string; policyPda: PublicKey }> {
  const { program, provider, ownerWallet, companyId, initial } = args;

  if (companyId.length !== 32) {
    throw new Error("companyId must be exactly 32 bytes");
  }

  const ctx = await buildCipherContext(ownerWallet, provider, program.programId);
  const nonce = randomBytes(16);
  const plaintext = [
    initial.autoApproveLimit,
    initial.dualApproveThreshold,
    initial.monthlyBurnCap,
    initial.monthlySpent,
  ];
  const ciphertexts = ctx.cipher.encrypt(plaintext, nonce);

  const computationOffset = new anchor.BN(randomBytes(8), "hex");
  const arc = buildArciumAccounts(program.programId, computationOffset);

  const policyAcc = policyPda(program.programId, companyId);

  const signature = await program.methods
    .initCompanyPolicy(
      computationOffset,
      Array.from(companyId),
      Array.from(ctx.publicKey),
      new anchor.BN(deserializeLE(nonce).toString()),
      Array.from(ciphertexts[0]),
      Array.from(ciphertexts[1]),
      Array.from(ciphertexts[2]),
      Array.from(ciphertexts[3])
    )
    .accountsPartial({
      payer: ownerWallet.publicKey,
      compDefAccount: compDefAddress(program.programId, "init_company_policy"),
      policyAcc,
      ...arc,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  await awaitComputationFinalization(
    provider,
    computationOffset,
    program.programId,
    "confirmed"
  );

  return { signature, policyPda: policyAcc };
}

// ═══ 2. EVALUATE POLICY (the hot path on every create_payment) ═════════════

export async function createPaymentConfidential(args: {
  program: Program;
  provider: AnchorProvider;
  requesterWallet: Keypair;
  companyId: Uint8Array;
  paymentId: bigint;
  request: ConfidentialPaymentRequest;
}): Promise<{
  signature: string;
  decisionPda: PublicKey;
  decision: PolicyDecision;
}> {
  const { program, provider, requesterWallet, companyId, paymentId, request } = args;

  const ctx = await buildCipherContext(requesterWallet, provider, program.programId);
  const nonce = randomBytes(16);
  const plaintext = [
    request.amount,
    BigInt(request.category),
    BigInt(request.riskScore),
  ];
  const ciphertexts = ctx.cipher.encrypt(plaintext, nonce);

  const computationOffset = new anchor.BN(randomBytes(8), "hex");
  const arc = buildArciumAccounts(program.programId, computationOffset);
  const policyAcc = policyPda(program.programId, companyId);
  const decisionAcc = decisionPda(program.programId, companyId, paymentId);

  const signature = await program.methods
    .evaluatePolicy(
      computationOffset,
      new anchor.BN(paymentId.toString()),
      Array.from(ctx.publicKey),
      new anchor.BN(deserializeLE(nonce).toString()),
      Array.from(ciphertexts[0]), // encrypted_amount
      Array.from(ciphertexts[1]), // encrypted_category
      Array.from(ciphertexts[2])  // encrypted_risk_score
    )
    .accountsPartial({
      payer: requesterWallet.publicKey,
      compDefAccount: compDefAddress(program.programId, "evaluate_policy"),
      policyAcc,
      decisionAcc,
      ...arc,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  await awaitComputationFinalization(
    provider,
    computationOffset,
    program.programId,
    "confirmed"
  );

  // Fetch decision PDA, decrypt the two ciphertexts (required_approvals + projected_monthly_spent).
  const decisionAccount: any = await (program.account as any).policyDecisionAccount.fetch(
    decisionAcc
  );
  const nonceBytes = bnToBytes16LE(decisionAccount.decisionNonce);

  const plaintexts = ctx.cipher.decrypt(
    [
      Uint8Array.from(decisionAccount.encryptedDecision[0]),
      Uint8Array.from(decisionAccount.encryptedDecision[1]),
    ],
    nonceBytes
  );

  const decision: PolicyDecision = {
    requiredApprovals: Number(plaintexts[0] & 0xffn),
    projectedMonthlySpent: plaintexts[1],
  };

  return { signature, decisionPda: decisionAcc, decision };
}

// ═══ 3. COMMIT EXECUTED PAYMENT SPEND ═══════════════════════════════════════

export async function commitPaymentSpendConfidential(args: {
  program: Program;
  provider: AnchorProvider;
  requesterWallet: Keypair;
  companyId: Uint8Array;
  /** Same value returned from `createPaymentConfidential().decision.projectedMonthlySpent`. */
  projectedMonthlySpent: bigint;
}): Promise<{ signature: string }> {
  const { program, provider, requesterWallet, companyId, projectedMonthlySpent } = args;

  const ctx = await buildCipherContext(requesterWallet, provider, program.programId);
  const nonce = randomBytes(16);
  const ciphertexts = ctx.cipher.encrypt([projectedMonthlySpent], nonce);

  const computationOffset = new anchor.BN(randomBytes(8), "hex");
  const arc = buildArciumAccounts(program.programId, computationOffset);
  const policyAcc = policyPda(program.programId, companyId);

  const signature = await program.methods
    .commitExecutedPayment(
      computationOffset,
      Array.from(ctx.publicKey),
      new anchor.BN(deserializeLE(nonce).toString()),
      Array.from(ciphertexts[0])
    )
    .accountsPartial({
      payer: requesterWallet.publicKey,
      compDefAccount: compDefAddress(program.programId, "commit_executed_payment"),
      policyAcc,
      ...arc,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  await awaitComputationFinalization(
    provider,
    computationOffset,
    program.programId,
    "confirmed"
  );

  return { signature };
}

// ═══ 4. RESET MONTHLY SPEND ════════════════════════════════════════════════

export async function resetMonthlySpendConfidential(args: {
  program: Program;
  provider: AnchorProvider;
  ownerWallet: Keypair;
  companyId: Uint8Array;
  currentMonth: number; // u8
}): Promise<{ signature: string }> {
  const { program, provider, ownerWallet, companyId, currentMonth } = args;

  const computationOffset = new anchor.BN(randomBytes(8), "hex");
  const arc = buildArciumAccounts(program.programId, computationOffset);
  const policyAcc = policyPda(program.programId, companyId);

  const signature = await program.methods
    .resetMonthlySpend(computationOffset, currentMonth)
    .accountsPartial({
      payer: ownerWallet.publicKey,
      compDefAccount: compDefAddress(program.programId, "reset_monthly_spend"),
      policyAcc,
      ...arc,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  await awaitComputationFinalization(
    provider,
    computationOffset,
    program.programId,
    "confirmed"
  );

  return { signature };
}

// ═══ 5. UPDATE POLICY LIMITS ═══════════════════════════════════════════════

export async function updatePolicyLimitsConfidential(args: {
  program: Program;
  provider: AnchorProvider;
  ownerWallet: Keypair;
  companyId: Uint8Array;
  newAutoApproveLimit: bigint;
  newDualApproveThreshold: bigint;
  newMonthlyBurnCap: bigint;
}): Promise<{ signature: string }> {
  const {
    program,
    provider,
    ownerWallet,
    companyId,
    newAutoApproveLimit,
    newDualApproveThreshold,
    newMonthlyBurnCap,
  } = args;

  const ctx = await buildCipherContext(ownerWallet, provider, program.programId);
  const nonce = randomBytes(16);
  const ciphertexts = ctx.cipher.encrypt(
    [newAutoApproveLimit, newDualApproveThreshold, newMonthlyBurnCap],
    nonce
  );

  const computationOffset = new anchor.BN(randomBytes(8), "hex");
  const arc = buildArciumAccounts(program.programId, computationOffset);
  const policyAcc = policyPda(program.programId, companyId);

  const signature = await program.methods
    .updatePolicyLimits(
      computationOffset,
      Array.from(ctx.publicKey),
      new anchor.BN(deserializeLE(nonce).toString()),
      Array.from(ciphertexts[0]),
      Array.from(ciphertexts[1]),
      Array.from(ciphertexts[2])
    )
    .accountsPartial({
      payer: ownerWallet.publicKey,
      compDefAccount: compDefAddress(program.programId, "update_policy_limits"),
      policyAcc,
      ...arc,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  await awaitComputationFinalization(
    provider,
    computationOffset,
    program.programId,
    "confirmed"
  );

  return { signature };
}

// ─── helpers ──────────────────────────────────────────────────────────────

function bnToBytes16LE(bn: anchor.BN): Uint8Array {
  const buf = Buffer.alloc(16);
  const bytes = bn.toArray("le", 16);
  Buffer.from(bytes).copy(buf);
  return new Uint8Array(buf);
}
