/**
 * Shared helpers for the confidential-policy test suite.
 *
 * These wrap the @arcium-hq/client SDK so each test can stay focused
 * on the behavioural assertion (auto-approve / dual / burn-cap / etc.)
 * rather than re-deriving keys + PDAs + account contexts.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { randomBytes, createHash } from "crypto";
import * as fs from "fs";
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
  getLookupTableAddress,
  RescueCipher,
  deserializeLE,
  x25519,
  uploadCircuit,
  getArciumProgram,
} from "@arcium-hq/client";
import type { ConfidentialPolicy } from "../target/types/confidential_policy";

export const ENCRYPTION_KEY_MESSAGE = "black-budget-arcium-encryption-key-v1";

export function readKpJson(path: string): Keypair {
  const bytes = JSON.parse(fs.readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

export function deriveEncryptionKey(wallet: Keypair, message = ENCRYPTION_KEY_MESSAGE) {
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, wallet.secretKey);
  const privateKey = new Uint8Array(createHash("sha256").update(signature).digest());
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries = 10
): Promise<Uint8Array> {
  let lastErr: unknown = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const k = await getMXEPublicKey(provider, programId);
      if (k) return k;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`getMXEPublicKey failed after ${maxRetries} retries: ${String(lastErr)}`);
}

export interface CipherCtx {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  cipher: RescueCipher;
}

export async function buildCipherCtx(
  wallet: Keypair,
  provider: anchor.AnchorProvider,
  programId: PublicKey
): Promise<CipherCtx> {
  const { privateKey, publicKey } = deriveEncryptionKey(wallet);
  const mxePub = await getMXEPublicKeyWithRetry(provider, programId);
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePub);
  return { privateKey, publicKey, cipher: new RescueCipher(sharedSecret) };
}

// ── PDA helpers ───────────────────────────────────────────────────────────

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

// ── Arcium account bundle for queue_computation ──────────────────────────

export function buildArciumAccounts(programId: PublicKey, computationOffset: anchor.BN) {
  const env = getArciumEnv();
  return {
    computationAccount: getComputationAccAddress(env.arciumClusterOffset, computationOffset),
    clusterAccount: getClusterAccAddress(env.arciumClusterOffset),
    mxeAccount: getMXEAccAddress(programId),
    mempoolAccount: getMempoolAccAddress(env.arciumClusterOffset),
    executingPool: getExecutingPoolAccAddress(env.arciumClusterOffset),
  };
}

export function compDefAddress(programId: PublicKey, ixName: string): PublicKey {
  return getCompDefAccAddress(
    programId,
    Buffer.from(getCompDefAccOffset(ixName)).readUInt32LE()
  );
}

// ── Comp-def initializers (one-time at deploy or test setup) ─────────────

export async function initAllCompDefs(
  program: Program<ConfidentialPolicy>,
  owner: Keypair,
  provider: anchor.AnchorProvider
): Promise<void> {
  // Resolve MXE-level accounts once.
  const mxeAccount = getMXEAccAddress(program.programId);
  const arciumProgram = getArciumProgram(provider);
  const mxeAcc = await (arciumProgram.account as any).mxeAccount.fetch(mxeAccount);
  const lutAddress = getLookupTableAddress(program.programId, mxeAcc.lutOffsetSlot);
  console.log(`  [mxe]  account=${mxeAccount.toBase58()}`);
  console.log(`  [mxe]  lut_offset_slot=${mxeAcc.lutOffsetSlot}, lut=${lutAddress.toBase58()}`);

  const circuits = [
    { ix: "initInitPolicyCompDef", name: "init_company_policy", bin: "init_company_policy" },
    { ix: "initEvalPolicyCompDef", name: "evaluate_policy", bin: "evaluate_policy" },
    { ix: "initCommitSpendCompDef", name: "commit_executed_payment", bin: "commit_executed_payment" },
    { ix: "initResetMonthCompDef", name: "reset_monthly_spend", bin: "reset_monthly_spend" },
    { ix: "initUpdateLimitsCompDef", name: "update_policy_limits", bin: "update_policy_limits" },
  ];

  for (const c of circuits) {
    try {
      const compDefAcc = compDefAddress(program.programId, c.name);
      const accounts: any = {
        payer: owner.publicKey,
        compDefAccount: compDefAcc,
        mxeAccount,
      };
      if (lutAddress) accounts.addressLookupTable = lutAddress;

      // Build + send manually for better error visibility.
      const tx = await (program.methods as any)[c.ix]()
        .accountsPartial(accounts)
        .transaction();
      tx.feePayer = owner.publicKey;
      tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
      tx.sign(owner);

      // Simulate first — surfaces "already in use" cleanly when the
      // comp def was created by a prior `arcium deploy` or test run.
      const sim = await provider.connection.simulateTransaction(tx);
      let alreadyInitialized = false;
      if (sim.value.err) {
        const logsStr = (sim.value.logs ?? []).join("\n");
        if (logsStr.includes("already in use")) {
          console.log(`  [comp-def] ${c.name}: already initialized (skip upload)`);
          alreadyInitialized = true;
        } else {
          console.error(`  [comp-def] ${c.name} simulate FAILED:`, sim.value.err);
          console.error(`  Logs:\n  ${sim.value.logs?.slice(-15).join("\n  ")}`);
          throw new Error(`simulate failed: ${JSON.stringify(sim.value.err)}`);
        }
      } else {
        const sig = await provider.connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
        });
        await provider.connection.confirmTransaction(sig, "confirmed");
        console.log(`  [comp-def] ${c.name}: ${sig}`);
      }

      if (alreadyInitialized) {
        // Skip uploadCircuit — would try to resize an existing account it
        // doesn't have permission to grow. `arcium deploy` already uploaded
        // the circuit binary during MXE init.
        continue;
      }

      // Upload the compiled .arcis circuit binary.
      await uploadCircuit(
        provider,
        c.bin,
        program.programId,
        fs.readFileSync(`build/${c.bin}.arcis`),
        true // overwrite if exists
      );
      console.log(`  [circuit] ${c.bin} uploaded`);
    } catch (err: any) {
      if (String(err).includes("already in use") || String(err).includes("AlreadyInitialized")) {
        console.log(`  [comp-def] ${c.name}: already initialized (ok)`);
      } else {
        throw err;
      }
    }
  }
}

// ── High-level test orchestration helpers ─────────────────────────────────

/** USDC has 6 decimals. */
export const USDC = (amount: number | bigint): bigint => BigInt(amount) * 1_000_000n;

/** Random 32-byte company_id for test isolation. */
export function randomCompanyId(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

/** Wrap `awaitComputationFinalization` with a tighter ts-mocha-friendly timeout. */
export async function awaitFinalization(
  provider: anchor.AnchorProvider,
  computationOffset: anchor.BN,
  programId: PublicKey,
  timeoutMs = 120_000
): Promise<string> {
  return await awaitComputationFinalization(provider, computationOffset, programId, "confirmed");
}

/** Decrypt the encrypted_decision array on a PolicyDecisionAccount. */
export function decryptDecision(
  decisionAccount: any,
  cipher: RescueCipher
): { requiredApprovals: number; projectedMonthlySpent: bigint } {
  const nonceBytes = bnToBytes16LE(decisionAccount.decisionNonce);
  // RescueCipher.decrypt expects number[][] (the SDK types it that way),
  // not Uint8Array[]. The PDA stores arrays of u8, which Anchor returns as
  // number[], so we pass them through directly.
  const plaintexts = cipher.decrypt(
    [
      Array.from(decisionAccount.encryptedDecision[0]) as number[],
      Array.from(decisionAccount.encryptedDecision[1]) as number[],
    ] as any,
    nonceBytes as any
  );
  return {
    requiredApprovals: Number(plaintexts[0] & 0xffn),
    projectedMonthlySpent: plaintexts[1],
  };
}

export function bnToBytes16LE(bn: anchor.BN): Uint8Array {
  const buf = Buffer.alloc(16);
  const arr = bn.toArray("le", 16);
  Buffer.from(arr).copy(buf);
  return new Uint8Array(buf);
}

/** Issue an evaluate_policy MPC computation. Returns the decrypted decision. */
export async function evaluateOnce(args: {
  program: Program<ConfidentialPolicy>;
  provider: anchor.AnchorProvider;
  requester: Keypair;
  companyId: Uint8Array;
  paymentId: bigint;
  amount: bigint;
  category?: number;
  riskScore?: number;
  cipher: RescueCipher;
  cipherPubKey: Uint8Array;
}): Promise<{ requiredApprovals: number; projectedMonthlySpent: bigint; signature: string }> {
  const { program, provider, requester, companyId, paymentId, amount, cipher, cipherPubKey } = args;

  const nonce = randomBytes(16);
  const plaintext = [amount, BigInt(args.category ?? 0), BigInt(args.riskScore ?? 0)];
  const cts = cipher.encrypt(plaintext, nonce);

  const computationOffset = new anchor.BN(randomBytes(8), "hex");
  const arc = buildArciumAccounts(program.programId, computationOffset);
  const policyAcc = policyPda(program.programId, companyId);
  const decisionAcc = decisionPda(program.programId, companyId, paymentId);

  const sig = await program.methods
    .evaluatePolicy(
      computationOffset,
      new anchor.BN(paymentId.toString()),
      Array.from(cipherPubKey),
      new anchor.BN(deserializeLE(nonce).toString()),
      Array.from(cts[0]),
      Array.from(cts[1]),
      Array.from(cts[2])
    )
    .accountsPartial({
      payer: requester.publicKey,
      compDefAccount: compDefAddress(program.programId, "evaluate_policy"),
      policyAcc,
      decisionAcc,
      ...arc,
    })
    .signers([requester])
    .rpc({ skipPreflight: true, commitment: "confirmed" });

  await awaitFinalization(provider, computationOffset, program.programId);

  const decision = await (program.account as any).policyDecisionAccount.fetch(decisionAcc);
  return { ...decryptDecision(decision, cipher), signature: sig };
}
