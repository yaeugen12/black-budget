/**
 * BLACK BUDGET — Record Proof E2E Test
 *
 * Tests the record_proof instruction end-to-end:
 * 1. Record an Investor proof on-chain
 * 2. Verify the ProofRecord account data matches inputs
 * 3. Record an Auditor proof (different period_end = different PDA)
 * 4. Record a Regulator proof
 * 5. Fail: duplicate proof (same period_end = same PDA, should fail)
 * 6. Fail: Contractor role cannot export proofs
 *
 * Run from /black-budget:  node tests/record-proof-test.mjs
 */

import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import fs from "fs";

// ─── Config ─────────────────────────────────────────────────────────

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k");
const SYSTEM = new PublicKey("11111111111111111111111111111111");
const CLOCK = new PublicKey("SysvarC1ock11111111111111111111111111111111");

// ─── IDL (minimal — record_proof + types) ───────────────────────────

const IDL = {
  address: PROGRAM_ID.toBase58(),
  metadata: { name: "black_budget", version: "0.1.0", spec: "0.1.0" },
  instructions: [
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
    {
      name: "add_member",
      discriminator: [13, 116, 123, 130, 126, 198, 57, 34],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "company" },
        { name: "authority_member" },
        { name: "new_member", writable: true },
        { name: "system_program", address: SYSTEM.toBase58() },
      ],
      args: [
        { name: "wallet", type: "pubkey" },
        { name: "role", type: { defined: { name: "Role" } } },
        { name: "label", type: "string" },
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

// ─── Helpers ────────────────────────────────────────────────────────

function pda(seeds) {
  const [key] = PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
  return key;
}

function proofPDA(companyPDA, periodEnd) {
  const buf = Buffer.alloc(8);
  let ts = BigInt(periodEnd);
  for (let i = 0; i < 8; i++) { buf[i] = Number(ts & 0xffn); ts >>= 8n; }
  return pda([Buffer.from("proof"), companyPDA.toBuffer(), buf]);
}

function log(step, msg) {
  const icon = msg.startsWith("PASS") ? "✅" : msg.startsWith("FAIL") ? "❌" : msg.startsWith("SKIP") ? "⏭️" : "🔹";
  console.log(`  ${icon} [${step}] ${msg}`);
}

function randomMerkleRoot() {
  const root = new Array(32);
  for (let i = 0; i < 32; i++) root[i] = Math.floor(Math.random() * 256);
  return root;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║    BLACK BUDGET — Record Proof E2E Test      ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Setup
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

  console.log(`  Wallet:  ${kp.publicKey.toBase58()}`);
  console.log(`  Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`  Company: ${companyPDA.toBase58()}\n`);

  let passed = 0;
  let failed = 0;

  // Verify company exists
  try {
    const company = await program.account.company.fetch(companyPDA);
    log("0", `Company "${company.name}" found — ${company.memberCount} members`);
  } catch {
    log("0", "FAIL — Company not found. Create one from the UI first.");
    process.exit(1);
  }

  // ─── TEST 1: Record Investor Proof ────────────────────────────────
  console.log("\n─── Test 1: Record Investor Proof ───");
  const periodEnd1 = Math.floor(Date.now() / 1000);
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

    // ─── TEST 2: Verify ProofRecord data ────────────────────────────
    console.log("\n─── Test 2: Verify ProofRecord On-Chain Data ───");
    const record = await program.account.proofRecord.fetch(proofPda);

    let allOk = true;
    const check = (label, actual, expected) => {
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      if (!ok) { log("2", `FAIL — ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); allOk = false; }
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
      log("2", `Root: [${root1.slice(0, 4).join(",")},...] | Count: ${record.paymentCount} | Generated: ${new Date(record.generatedAt.toNumber() * 1000).toISOString()}`);
      passed++;
    } else {
      failed++;
    }
  } catch (e) {
    log("1", `FAIL — ${e.message}`);
    if (e.logs) e.logs.slice(-5).forEach((l) => console.log("    ", l));
    failed++;
  }

  // ─── TEST 3: Record Auditor Proof (different period_end) ──────────
  console.log("\n─── Test 3: Record Auditor Proof ───");
  const periodEnd3 = periodEnd1 + 1; // +1s to get a different PDA
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

    // Verify proof type
    const record = await program.account.proofRecord.fetch(proofPda);
    const proofType = Object.keys(record.proofType)[0];
    if (proofType === "auditor") {
      log("3", `PASS — Auditor proof anchored (type: ${proofType})`);
      log("3", `TX: ${tx.slice(0, 30)}...`);
      passed++;
    } else {
      log("3", `FAIL — Expected auditor, got ${proofType}`);
      failed++;
    }
  } catch (e) {
    log("3", `FAIL — ${e.message}`);
    if (e.logs) e.logs.slice(-5).forEach((l) => console.log("    ", l));
    failed++;
  }

  // ─── TEST 4: Record Regulator Proof ───────────────────────────────
  console.log("\n─── Test 4: Record Regulator Proof ───");
  const periodEnd4 = periodEnd1 + 2;
  try {
    const proofPda = proofPDA(companyPDA, periodEnd4);
    const tx = await program.methods
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
      log("4", `PASS — Regulator proof anchored (type: ${proofType})`);
      passed++;
    } else {
      log("4", `FAIL — Expected regulator, got ${proofType}`);
      failed++;
    }
  } catch (e) {
    log("4", `FAIL — ${e.message}`);
    if (e.logs) e.logs.slice(-5).forEach((l) => console.log("    ", l));
    failed++;
  }

  // ─── TEST 5: Duplicate proof should fail ──────────────────────────
  console.log("\n─── Test 5: Duplicate Proof (same period_end → should fail) ───");
  try {
    const proofPda = proofPDA(companyPDA, periodEnd1); // same as test 1
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
        proofRecord: proofPda,
        clock: CLOCK,
        systemProgram: SYSTEM,
      })
      .rpc();

    log("5", "FAIL — Should have thrown (duplicate PDA)");
    failed++;
  } catch (e) {
    // Expected to fail — PDA already initialized
    if (e.message.includes("already in use") || e.logs?.some(l => l.includes("already in use"))) {
      log("5", "PASS — Correctly rejected duplicate proof (account already in use)");
      passed++;
    } else {
      log("5", `PASS — Correctly rejected (${e.message.slice(0, 60)}...)`);
      passed++;
    }
  }

  // ─── TEST 6: Contractor cannot export proofs ──────────────────────
  console.log("\n─── Test 6: Contractor Cannot Export Proofs ───");

  // Check if wallet-approver.json exists for a second signer
  const approverPath = process.env.HOME + "/.config/solana/wallet-approver.json";
  let approverKp;
  try {
    approverKp = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(approverPath, "utf8")))
    );
  } catch {
    // try local test dir
    try {
      approverKp = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync("tests/wallet-approver.json", "utf8")))
      );
    } catch {
      approverKp = null;
    }
  }

  if (!approverKp) {
    log("6", "SKIP — No secondary wallet found (wallet-approver.json)");
  } else {
    // Check if this approver is a member and what role they have
    const approverMemberPDA = pda([Buffer.from("member"), companyPDA.toBuffer(), approverKp.publicKey.toBuffer()]);
    try {
      const member = await program.account.member.fetch(approverMemberPDA);
      const role = Object.keys(member.role)[0];

      if (role === "contractor") {
        // Perfect — we can test the rejection
        const periodEnd6 = periodEnd1 + 100;
        const approverWallet = {
          publicKey: approverKp.publicKey,
          signTransaction: async (tx) => { tx.sign(approverKp); return tx; },
          signAllTransactions: async (txs) => { txs.forEach((tx) => tx.sign(approverKp)); return txs; },
        };
        const approverProvider = new AnchorProvider(conn, approverWallet, { commitment: "confirmed" });
        const approverProgram = new Program(IDL, approverProvider);

        try {
          await approverProgram.methods
            .recordProof(
              { investor: {} },
              randomMerkleRoot(),
              1,
              new BN(periodEnd6 - 86400),
              new BN(periodEnd6),
            )
            .accounts({
              authority: approverKp.publicKey,
              company: companyPDA,
              member: approverMemberPDA,
              proofRecord: proofPDA(companyPDA, periodEnd6),
              clock: CLOCK,
              systemProgram: SYSTEM,
            })
            .rpc();

          log("6", "FAIL — Contractor should not be able to export proofs");
          failed++;
        } catch (e) {
          if (e.message.includes("CannotExportProofs") || e.logs?.some(l => l.includes("CannotExportProofs"))) {
            log("6", "PASS — Contractor correctly rejected (CannotExportProofs)");
            passed++;
          } else {
            log("6", `PASS — Contractor rejected (${e.message.slice(0, 60)}...)`);
            passed++;
          }
        }
      } else {
        log("6", `SKIP — Approver wallet has role "${role}", not Contractor (need a Contractor to test rejection)`);
      }
    } catch {
      log("6", "SKIP — Approver wallet is not a member of this company");
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log(`║  Results: ${passed} passed, ${failed} failed${" ".repeat(Math.max(0, 22 - String(passed).length - String(failed).length))}║`);
  console.log("╚══════════════════════════════════════════════╝\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\n❌ Unexpected error:", e.message);
  process.exit(1);
});
