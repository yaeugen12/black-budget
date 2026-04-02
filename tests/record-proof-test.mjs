/**
 * BLACK BUDGET — Record Proof E2E Test
 *
 * Tests the record_proof instruction end-to-end:
 * 1. Ensure a company exists for the local wallet
 * 2. Record an Investor proof on-chain
 * 3. Verify the ProofRecord account data matches inputs
 * 4. Record an Auditor proof (different period_end = different PDA)
 * 5. Record a Regulator proof
 * 6. Fail: duplicate proof (same period_end = same PDA, should fail)
 * 7. Fail: Contractor role cannot export proofs
 *
 * Run from /black-budget: node tests/record-proof-test.mjs
 */

import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k");
const USDC_MINT = new PublicKey("Fc4uFQAaT38mwx6ELhp8GXHsuRBsyYPuW3Ltcn4y7meF");
const SYSTEM = new PublicKey("11111111111111111111111111111111");
const CLOCK = new PublicKey("SysvarC1ock11111111111111111111111111111111");

const IDL = {
  address: PROGRAM_ID.toBase58(),
  metadata: { name: "black_budget", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "initialize_company",
      discriminator: [75, 156, 55, 94, 184, 64, 58, 30],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "company", writable: true },
        { name: "vault", writable: true },
        { name: "usdc_mint" },
        { name: "founder_member", writable: true },
        { name: "token_program" },
        { name: "system_program", address: SYSTEM.toBase58() },
      ],
      args: [{ name: "name", type: "string" }],
    },
    {
      name: "add_member",
      discriminator: [13, 116, 123, 130, 126, 198, 57, 34],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "company", writable: true },
        { name: "authority_member" },
        { name: "new_member_wallet" },
        { name: "member", writable: true },
        { name: "system_program", address: SYSTEM.toBase58() },
      ],
      args: [
        { name: "role", type: { defined: { name: "Role" } } },
        { name: "label", type: "string" },
      ],
    },
    {
      name: "record_proof",
      discriminator: [144, 172, 144, 35, 124, 170, 93, 80],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "company" },
        { name: "member" },
        { name: "proof_record", writable: true },
        { name: "clock" },
        { name: "system_program", address: SYSTEM.toBase58() },
      ],
      args: [
        { name: "proof_type", type: { defined: { name: "ProofType" } } },
        { name: "merkle_root", type: { array: ["u8", 32] } },
        { name: "payment_count", type: "u32" },
        { name: "period_start", type: "i64" },
        { name: "period_end", type: "i64" },
      ],
    },
  ],
  accounts: [
    { name: "Company", discriminator: [32, 212, 52, 137, 90, 7, 206, 183] },
    { name: "Member", discriminator: [54, 19, 162, 21, 29, 166, 17, 198] },
    { name: "ProofRecord", discriminator: [237, 59, 155, 172, 204, 117, 87, 44] },
  ],
  types: [
    {
      name: "Company", type: { kind: "struct", fields: [
        { name: "authority", type: "pubkey" }, { name: "name", type: "string" },
        { name: "vault", type: "pubkey" },
        { name: "policy", type: { defined: { name: "PolicyConfig" } } },
        { name: "member_count", type: "u8" }, { name: "payment_nonce", type: "u64" },
        { name: "total_spent", type: "u64" }, { name: "monthly_spent", type: "u64" },
        { name: "current_month", type: "u8" }, { name: "created_at", type: "i64" },
        { name: "bump", type: "u8" },
      ]},
    },
    {
      name: "Member", type: { kind: "struct", fields: [
        { name: "company", type: "pubkey" }, { name: "wallet", type: "pubkey" },
        { name: "role", type: { defined: { name: "Role" } } },
        { name: "label", type: "string" }, { name: "added_at", type: "i64" },
        { name: "is_active", type: "bool" }, { name: "bump", type: "u8" },
      ]},
    },
    {
      name: "ProofRecord", type: { kind: "struct", fields: [
        { name: "company", type: "pubkey" },
        { name: "generated_by", type: "pubkey" },
        { name: "proof_type", type: { defined: { name: "ProofType" } } },
        { name: "merkle_root", type: { array: ["u8", 32] } },
        { name: "period_start", type: "i64" },
        { name: "period_end", type: "i64" },
        { name: "payment_count", type: "u32" },
        { name: "generated_at", type: "i64" },
        { name: "bump", type: "u8" },
      ]},
    },
    {
      name: "PolicyConfig", type: { kind: "struct", fields: [
        { name: "auto_approve_limit", type: "u64" },
        { name: "dual_approve_threshold", type: "u64" },
        { name: "monthly_burn_cap", type: "u64" },
        { name: "require_vendor_verification", type: "bool" },
        { name: "restrict_to_known_recipients", type: "bool" },
        { name: "min_runway_months", type: "u8" },
      ]},
    },
    {
      name: "Role", type: { kind: "enum", variants: [
        { name: "Owner" }, { name: "Approver" }, { name: "Viewer" }, { name: "Contractor" },
      ]},
    },
    {
      name: "ProofType", type: { kind: "enum", variants: [
        { name: "Investor" }, { name: "Auditor" }, { name: "Regulator" },
      ]},
    },
  ],
  errors: [],
};

function pda(seeds) {
  const [key] = PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
  return key;
}

function proofPDA(companyPDA, periodEnd) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(periodEnd));
  return pda([Buffer.from("proof"), companyPDA.toBuffer(), buf]);
}

function log(step, msg) {
  const icon = msg.startsWith("PASS") ? "✅" : msg.startsWith("FAIL") ? "❌" : msg.startsWith("SETUP") ? "🛠️" : "🔹";
  console.log(`  ${icon} [${step}] ${msg}`);
}

function randomMerkleRoot() {
  const root = new Array(32);
  for (let i = 0; i < 32; i++) root[i] = Math.floor(Math.random() * 256);
  return root;
}

function isFallbackError(error) {
  return (
    error.message.includes("InstructionFallbackNotFound") ||
    error.logs?.some((line) => line.includes("InstructionFallbackNotFound"))
  );
}

async function ensureCompany(program, owner, companyPDA, memberPDA) {
  try {
    const company = await program.account.company.fetch(companyPDA);
    log("0", `PASS — Company "${company.name}" found (${company.memberCount} members)`);
    return;
  } catch {
    const vaultPDA = pda([Buffer.from("vault"), companyPDA.toBuffer()]);
    const tx = await program.methods
      .initializeCompany("Proof Test Co")
      .accounts({
        authority: owner.publicKey,
        company: companyPDA,
        vault: vaultPDA,
        usdcMint: USDC_MINT,
        founderMember: memberPDA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SYSTEM,
      })
      .rpc();

    log("0", `PASS — Company created for test setup (${tx.slice(0, 30)}...)`);
  }
}

async function fundWallet(connection, owner, recipient, lamports) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: owner.publicKey,
      toPubkey: recipient.publicKey,
      lamports,
    })
  );

  await sendAndConfirmTransaction(connection, tx, [owner], { commitment: "confirmed" });
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║    BLACK BUDGET — Record Proof E2E Test      ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const conn = new Connection(RPC, "confirmed");
  const kp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8")))
  );
  const wallet = {
    publicKey: kp.publicKey,
    signTransaction: async (tx) => { tx.sign(kp); return tx; },
    signAllTransactions: async (txs) => { txs.forEach((tx) => tx.sign(kp)); return txs; },
  };
  const provider = new AnchorProvider(conn, wallet, { commitment: "confirmed" });
  const program = new Program(IDL, provider);

  const companyPDA = pda([Buffer.from("company"), kp.publicKey.toBuffer()]);
  const memberPDA = pda([Buffer.from("member"), companyPDA.toBuffer(), kp.publicKey.toBuffer()]);
  const basePeriodEnd = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);

  console.log(`  Wallet:  ${kp.publicKey.toBase58()}`);
  console.log(`  Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`  Company: ${companyPDA.toBase58()}\n`);

  let passed = 0;
  let failed = 0;

  await ensureCompany(program, kp, companyPDA, memberPDA);

  console.log("\n─── Test 1: Record Investor Proof ───");
  const periodEnd1 = basePeriodEnd;
  const periodStart1 = periodEnd1 - 86400 * 30;
  const root1 = randomMerkleRoot();
  const paymentCount1 = 7;

  try {
    const proofPda = proofPDA(companyPDA, periodEnd1);
    const tx = await program.methods
      .recordProof(
        { investor: {} },
        root1,
        paymentCount1,
        new BN(periodStart1),
        new BN(periodEnd1),
      )
      .accounts({
        authority: kp.publicKey,
        company: companyPDA,
        member: memberPDA,
        proofRecord: proofPda,
        clock: CLOCK,
        systemProgram: SYSTEM,
      })
      .rpc();

    log("1", `PASS — Investor proof anchored`);
    log("1", `PDA: ${proofPda.toBase58().slice(0, 20)}...`);
    log("1", `TX: ${tx.slice(0, 30)}...`);
    passed++;

    console.log("\n─── Test 2: Verify ProofRecord On-Chain Data ───");
    const record = await program.account.proofRecord.fetch(proofPda);
    let allOk = true;
    const check = (label, actual, expected) => {
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      if (!ok) {
        log("2", `FAIL — ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
        allOk = false;
      }
    };

    check("company", record.company.toBase58(), companyPDA.toBase58());
    check("generated_by", record.generatedBy.toBase58(), kp.publicKey.toBase58());
    check("proof_type", Object.keys(record.proofType)[0], "investor");
    check("payment_count", record.paymentCount, paymentCount1);
    check("period_start", record.periodStart.toNumber(), periodStart1);
    check("period_end", record.periodEnd.toNumber(), periodEnd1);
    check("merkle_root", Array.from(record.merkleRoot), root1);
    check("generated_at > 0", record.generatedAt.toNumber() > 0, true);

    if (allOk) {
      log("2", "PASS — All ProofRecord fields match inputs");
      passed++;
    } else {
      failed++;
    }
  } catch (e) {
    if (isFallbackError(e)) {
      log("1", "FAIL — Devnet program does not include record_proof yet. Deploy the updated program first.");
      process.exit(1);
    }
    log("1", `FAIL — ${e.message}`);
    if (e.logs) e.logs.slice(-5).forEach((l) => console.log("    ", l));
    failed++;
  }

  console.log("\n─── Test 3: Record Auditor Proof ───");
  const periodEnd3 = basePeriodEnd + 1;
  try {
    const proofPda = proofPDA(companyPDA, periodEnd3);
    const tx = await program.methods
      .recordProof(
        { auditor: {} },
        randomMerkleRoot(),
        12,
        new BN(periodEnd3 - 86400 * 30),
        new BN(periodEnd3),
      )
      .accounts({
        authority: kp.publicKey,
        company: companyPDA,
        member: memberPDA,
        proofRecord: proofPda,
        clock: CLOCK,
        systemProgram: SYSTEM,
      })
      .rpc();

    const record = await program.account.proofRecord.fetch(proofPda);
    const proofType = Object.keys(record.proofType)[0];
    if (proofType === "auditor") {
      log("3", `PASS — Auditor proof anchored (TX ${tx.slice(0, 30)}...)`);
      passed++;
    } else {
      log("3", `FAIL — Expected auditor, got ${proofType}`);
      failed++;
    }
  } catch (e) {
    if (isFallbackError(e)) {
      log("3", "FAIL — Devnet program does not include record_proof yet. Deploy the updated program first.");
      process.exit(1);
    }
    log("3", `FAIL — ${e.message}`);
    if (e.logs) e.logs.slice(-5).forEach((l) => console.log("    ", l));
    failed++;
  }

  console.log("\n─── Test 4: Record Regulator Proof ───");
  const periodEnd4 = basePeriodEnd + 2;
  try {
    const proofPda = proofPDA(companyPDA, periodEnd4);
    await program.methods
      .recordProof(
        { regulator: {} },
        randomMerkleRoot(),
        5,
        new BN(periodEnd4 - 86400 * 7),
        new BN(periodEnd4),
      )
      .accounts({
        authority: kp.publicKey,
        company: companyPDA,
        member: memberPDA,
        proofRecord: proofPda,
        clock: CLOCK,
        systemProgram: SYSTEM,
      })
      .rpc();

    const record = await program.account.proofRecord.fetch(proofPda);
    const proofType = Object.keys(record.proofType)[0];
    if (proofType === "regulator") {
      log("4", "PASS — Regulator proof anchored");
      passed++;
    } else {
      log("4", `FAIL — Expected regulator, got ${proofType}`);
      failed++;
    }
  } catch (e) {
    if (isFallbackError(e)) {
      log("4", "FAIL — Devnet program does not include record_proof yet. Deploy the updated program first.");
      process.exit(1);
    }
    log("4", `FAIL — ${e.message}`);
    if (e.logs) e.logs.slice(-5).forEach((l) => console.log("    ", l));
    failed++;
  }

  console.log("\n─── Test 5: Duplicate Proof (same period_end → should fail) ───");
  try {
    await program.methods
      .recordProof(
        { investor: {} },
        randomMerkleRoot(),
        99,
        new BN(periodStart1),
        new BN(periodEnd1),
      )
      .accounts({
        authority: kp.publicKey,
        company: companyPDA,
        member: memberPDA,
        proofRecord: proofPDA(companyPDA, periodEnd1),
        clock: CLOCK,
        systemProgram: SYSTEM,
      })
      .rpc();

    log("5", "FAIL — Should have thrown (duplicate PDA)");
    failed++;
  } catch (e) {
    if (isFallbackError(e)) {
      log("5", "FAIL — Duplicate-proof check is blocked because devnet is still running the old program.");
      failed++;
    } else if (e.message.includes("already in use") || e.logs?.some((l) => l.includes("already in use"))) {
      log("5", "PASS — Correctly rejected duplicate proof (account already in use)");
      passed++;
    } else {
      log("5", `PASS — Correctly rejected (${e.message.slice(0, 60)}...)`);
      passed++;
    }
  }

  console.log("\n─── Test 6: Contractor Cannot Export Proofs ───");
  const contractorKp = Keypair.generate();
  const contractorMemberPDA = pda([
    Buffer.from("member"),
    companyPDA.toBuffer(),
    contractorKp.publicKey.toBuffer(),
  ]);

  try {
    await fundWallet(conn, kp, contractorKp, Math.floor(0.01 * LAMPORTS_PER_SOL));
    log("6", "SETUP — Funded temporary contractor wallet");

    const addTx = await program.methods
      .addMember({ contractor: {} }, "Proof Test Contractor")
      .accounts({
        authority: kp.publicKey,
        company: companyPDA,
        authorityMember: memberPDA,
        newMemberWallet: contractorKp.publicKey,
        member: contractorMemberPDA,
        systemProgram: SYSTEM,
      })
      .rpc();
    log("6", `SETUP — Contractor member added (${addTx.slice(0, 30)}...)`);

    const contractorWallet = {
      publicKey: contractorKp.publicKey,
      signTransaction: async (tx) => { tx.sign(contractorKp); return tx; },
      signAllTransactions: async (txs) => { txs.forEach((tx) => tx.sign(contractorKp)); return txs; },
    };
    const contractorProvider = new AnchorProvider(conn, contractorWallet, { commitment: "confirmed" });
    const contractorProgram = new Program(IDL, contractorProvider);
    const periodEnd6 = basePeriodEnd + 100;

    await contractorProgram.methods
      .recordProof(
        { investor: {} },
        randomMerkleRoot(),
        1,
        new BN(periodEnd6 - 86400),
        new BN(periodEnd6),
      )
      .accounts({
        authority: contractorKp.publicKey,
        company: companyPDA,
        member: contractorMemberPDA,
        proofRecord: proofPDA(companyPDA, periodEnd6),
        clock: CLOCK,
        systemProgram: SYSTEM,
      })
      .rpc();

    log("6", "FAIL — Contractor should not be able to export proofs");
    failed++;
  } catch (e) {
    if (isFallbackError(e)) {
      log("6", "FAIL — Contractor rejection check is blocked because devnet is still running the old program.");
      failed++;
    } else if (e.message.includes("CannotExportProofs") || e.logs?.some((l) => l.includes("CannotExportProofs"))) {
      log("6", "PASS — Contractor correctly rejected (CannotExportProofs)");
      passed++;
    } else {
      log("6", `PASS — Contractor rejected (${e.message.slice(0, 60)}...)`);
      passed++;
    }
  }

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log(`║  Results: ${passed} passed, ${failed} failed${" ".repeat(Math.max(0, 22 - String(passed).length - String(failed).length))}║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\n❌ Unexpected error:", e.message);
  process.exit(1);
});
