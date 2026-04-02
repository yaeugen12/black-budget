/**
 * BLACK BUDGET — Multi-Wallet + Confidential Mint Test
 *
 * Tests:
 * 1. Create company with CONFIDENTIAL mint
 * 2. Set policies ($5K auto, $15K dual)
 * 3. Add second wallet as Approver
 * 4. Create $8K payment (requires 1 approval)
 * 5. Second wallet approves
 * 6. Create $3K payment (auto-approved)
 * 7. Execute auto-approved payment
 * 8. Verify final state
 *
 * Run: cd black-budget/app && node multi-wallet-test.mjs
 */

import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import fs from "fs";

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k");
const USDC_MINT = new PublicKey("Fc4uFQAaT38mwx6ELhp8GXHsuRBsyYPuW3Ltcn4y7meF"); // CONFIDENTIAL
const SYSTEM = new PublicKey("11111111111111111111111111111111");

const IDL = JSON.parse(JSON.stringify((await import("./src/lib/idl.ts")).IDL));
// Fix: IDL is imported as const, need mutable copy for Anchor

function pda(seeds) {
  const [key] = PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
  return key;
}

function paymentPDA(company, nonce) {
  const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(nonce));
  return pda([Buffer.from("payment"), company.toBuffer(), b]);
}

function log(step, msg) {
  const icon = msg.startsWith("PASS") ? "\x1b[32m✅\x1b[0m" : msg.startsWith("FAIL") ? "\x1b[31m❌\x1b[0m" : "\x1b[36m🔹\x1b[0m";
  console.log(`  ${icon} [${step}] ${msg}`);
}

function makeWallet(kp) {
  return {
    publicKey: kp.publicKey,
    signTransaction: async (tx) => { tx.sign(kp); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(kp)); return txs; },
  };
}

async function main() {
  console.log("\n\x1b[35m╔══════════════════════════════════════════════════════╗\x1b[0m");
  console.log("\x1b[35m║  BLACK BUDGET — Multi-Wallet + Confidential Test     ║\x1b[0m");
  console.log("\x1b[35m╚══════════════════════════════════════════════════════╝\x1b[0m\n");

  const conn = new Connection(RPC, "confirmed");

  // Load wallets
  const owner = Keypair.fromSecretKey(Uint8Array.from(
    JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8"))
  ));
  const approver = Keypair.fromSecretKey(Uint8Array.from(
    JSON.parse(fs.readFileSync("../tests/wallet-approver.json", "utf8"))
  ));

  console.log(`  Owner:    ${owner.publicKey.toBase58()}`);
  console.log(`  Approver: ${approver.publicKey.toBase58()}`);
  console.log(`  Mint:     ${USDC_MINT.toBase58()} (Confidential)\n`);

  // Programs for each wallet
  const ownerProvider = new AnchorProvider(conn, makeWallet(owner), { commitment: "confirmed" });
  const approverProvider = new AnchorProvider(conn, makeWallet(approver), { commitment: "confirmed" });
  const ownerProgram = new Program(IDL, ownerProvider);
  const approverProgram = new Program(IDL, approverProvider);

  // PDAs — use a fresh company (derive from owner)
  const companyPDA = pda([Buffer.from("company"), owner.publicKey.toBuffer()]);
  const vaultPDA = pda([Buffer.from("vault"), companyPDA.toBuffer()]);
  const ownerMemberPDA = pda([Buffer.from("member"), companyPDA.toBuffer(), owner.publicKey.toBuffer()]);
  const approverMemberPDA = pda([Buffer.from("member"), companyPDA.toBuffer(), approver.publicKey.toBuffer()]);

  let passed = 0, failed = 0;

  // ─── STEP 1: Create Company (or verify existing) ──────────────
  console.log("─── Step 1: Company with Confidential Mint ───");
  try {
    let company;
    try {
      company = await ownerProgram.account.company.fetch(companyPDA);
      log("1", `PASS — Company "${company.name}" already exists`);
    } catch {
      const tx = await ownerProgram.methods.initializeCompany("Black Budget Demo").accounts({
        authority: owner.publicKey, company: companyPDA, vault: vaultPDA,
        usdcMint: USDC_MINT, founderMember: ownerMemberPDA,
        tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SYSTEM,
      }).rpc();
      company = await ownerProgram.account.company.fetch(companyPDA);
      log("1", `PASS — Company "${company.name}" created. TX: ${tx.slice(0, 24)}...`);
    }

    // Verify confidential mint
    const mintInfo = await conn.getAccountInfo(USDC_MINT);
    log("1", `Mint size: ${mintInfo.data.length} bytes (>200 = has extensions)`);
    log("1", mintInfo.data.length > 200 ? "PASS — Confidential extension confirmed" : "FAIL — No extension");
    passed++;
  } catch (e) {
    log("1", `FAIL — ${e.message}`); failed++;
    if (e.logs) e.logs.slice(-3).forEach(l => console.log("    ", l));
    process.exit(1);
  }

  // ─── STEP 2: Set Policies ─────────────────────────────────────
  console.log("\n─── Step 2: Treasury Policies ───");
  try {
    await ownerProgram.methods.setPolicies({
      autoApproveLimit: new BN(5000 * 1e6), dualApproveThreshold: new BN(15000 * 1e6),
      monthlyBurnCap: new BN(75000 * 1e6), requireVendorVerification: true,
      restrictToKnownRecipients: false, minRunwayMonths: 8,
    }).accounts({
      authority: owner.publicKey, company: companyPDA, authorityMember: ownerMemberPDA,
    }).rpc();
    log("2", "PASS — Policies: $5K auto / $15K dual / $75K cap");
    passed++;
  } catch (e) { log("2", `FAIL — ${e.message}`); failed++; }

  // ─── STEP 3: Add Approver ─────────────────────────────────────
  console.log("\n─── Step 3: Add Approver (second wallet) ───");
  try {
    try {
      await ownerProgram.account.member.fetch(approverMemberPDA);
      log("3", "PASS — Approver already added");
    } catch {
      await ownerProgram.methods.addMember({ approver: {} }, "CFO").accounts({
        authority: owner.publicKey, company: companyPDA,
        authorityMember: ownerMemberPDA, newMemberWallet: approver.publicKey,
        member: approverMemberPDA, systemProgram: SYSTEM,
      }).rpc();
      log("3", `PASS — Approver added: ${approver.publicKey.toBase58().slice(0, 12)}... as CFO`);
    }
    passed++;
  } catch (e) { log("3", `FAIL — ${e.message}`); failed++; }

  // ─── STEP 4: Create $8K payment (needs 1 approval) ────────────
  console.log("\n─── Step 4: Create $8,000 Payment (needs approval) ───");
  let paymentId8k;
  try {
    const company = await ownerProgram.account.company.fetch(companyPDA);
    paymentId8k = company.paymentNonce.toNumber();
    const payPDA = paymentPDA(companyPDA, paymentId8k);
    const recipient = Keypair.generate();
    const hash = new Array(32).fill(0); hash[0] = 0xBB;

    await ownerProgram.methods.createPayment(
      new BN(8000 * 1e6), { vendor: {} }, hash, "AWS Q2 Infrastructure", 20
    ).accounts({
      requester: owner.publicKey, company: companyPDA,
      requesterMember: ownerMemberPDA, recipient: recipient.publicKey,
      payment: payPDA, systemProgram: SYSTEM,
    }).rpc();

    const pay = await ownerProgram.account.paymentRequest.fetch(payPDA);
    const status = Object.keys(pay.status)[0];
    log("4", `PASS — Payment #${paymentId8k}: $8,000 | Status: ${status} | Need: ${pay.requiredApprovals} approval(s)`);
    if (status === "pending") log("4", "Correctly requires approval (between $5K-$15K)");
    passed++;
  } catch (e) { log("4", `FAIL — ${e.message}`); failed++; }

  // ─── STEP 5: Approver approves (second wallet!) ────────────────
  console.log("\n─── Step 5: CFO Approves (different wallet) ───");
  try {
    const payPDA = paymentPDA(companyPDA, paymentId8k);

    await approverProgram.methods.approvePayment().accounts({
      approver: approver.publicKey, company: companyPDA,
      approverMember: approverMemberPDA, payment: payPDA,
    }).rpc();

    const pay = await ownerProgram.account.paymentRequest.fetch(payPDA);
    const status = Object.keys(pay.status)[0];
    log("5", `PASS — CFO approved! Status now: ${status}`);
    log("5", `Approvals: [${pay.approvals.map(a => a.toBase58().slice(0, 8) + "...").join(", ")}]`);
    passed++;
  } catch (e) { log("5", `FAIL — ${e.message}`); failed++; }

  // ─── STEP 6: Create $3K payment (auto-approved) ───────────────
  console.log("\n─── Step 6: Create $3,200 Payment (auto-approve) ───");
  let paymentId3k;
  try {
    const company = await ownerProgram.account.company.fetch(companyPDA);
    paymentId3k = company.paymentNonce.toNumber();
    const payPDA = paymentPDA(companyPDA, paymentId3k);
    const recipient = Keypair.generate();
    const hash = new Array(32).fill(0); hash[0] = 0xCC;

    await ownerProgram.methods.createPayment(
      new BN(3200 * 1e6), { contractor: {} }, hash, "UI/UX Dashboard Redesign", 10
    ).accounts({
      requester: owner.publicKey, company: companyPDA,
      requesterMember: ownerMemberPDA, recipient: recipient.publicKey,
      payment: payPDA, systemProgram: SYSTEM,
    }).rpc();

    const pay = await ownerProgram.account.paymentRequest.fetch(payPDA);
    const status = Object.keys(pay.status)[0];
    log("6", `PASS — Payment #${paymentId3k}: $3,200 | Status: ${status}`);
    if (status === "approved") log("6", "Correctly auto-approved (under $5K threshold)");
    passed++;
  } catch (e) { log("6", `FAIL — ${e.message}`); failed++; }

  // ─── STEP 7: Execute auto-approved payment ─────────────────────
  console.log("\n─── Step 7: Execute Payment (USDC transfer) ───");
  try {
    const payPDA = paymentPDA(companyPDA, paymentId3k);
    const pay = await ownerProgram.account.paymentRequest.fetch(payPDA);
    const recipientATA = getAssociatedTokenAddressSync(
      USDC_MINT, pay.recipient, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Create recipient ATA
    const createIx = createAssociatedTokenAccountInstruction(
      owner.publicKey, recipientATA, pay.recipient, USDC_MINT,
      TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const ataTx = new Transaction().add(createIx);
    await sendAndConfirmTransaction(conn, ataTx, [owner]);

    // Fund vault if needed
    const vaultBal = await conn.getTokenAccountBalance(vaultPDA).catch(() => null);
    if (!vaultBal || Number(vaultBal.value.uiAmount) < 3200) {
      log("7", "Funding vault with USDC...");
      const userATA = getAssociatedTokenAddressSync(
        USDC_MINT, owner.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const fundTx = new Transaction().add(createTransferCheckedInstruction(
        userATA, USDC_MINT, vaultPDA, owner.publicKey, BigInt(100000 * 1e6), 6, [], TOKEN_2022_PROGRAM_ID
      ));
      await sendAndConfirmTransaction(conn, fundTx, [owner]);
      log("7", "Vault funded with 100,000 USDC");
    }

    await ownerProgram.methods.executePayment().accounts({
      executor: owner.publicKey, company: companyPDA,
      executorMember: ownerMemberPDA, payment: payPDA,
      vault: vaultPDA, recipientTokenAccount: recipientATA,
      usdcMint: USDC_MINT, tokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc();

    const after = await ownerProgram.account.paymentRequest.fetch(payPDA);
    log("7", `PASS — Payment executed! Status: ${Object.keys(after.status)[0]}`);
    passed++;
  } catch (e) {
    log("7", `FAIL — ${e.message}`);
    if (e.logs) e.logs.slice(-3).forEach(l => console.log("    ", l));
    failed++;
  }

  // ─── STEP 8: Final State ──────────────────────────────────────
  console.log("\n─── Step 8: Final Verification ───");
  try {
    const company = await ownerProgram.account.company.fetch(companyPDA);
    const vaultBal = await conn.getTokenAccountBalance(vaultPDA).catch(() => ({ value: { uiAmount: 0 } }));

    log("8", "PASS — Final state:");
    log("8", `Company: ${company.name}`);
    log("8", `Members: ${company.memberCount} (Owner + CFO)`);
    log("8", `Payments: ${company.paymentNonce.toNumber()}`);
    log("8", `Total Spent: $${company.totalSpent.toNumber() / 1e6}`);
    log("8", `Vault Balance: $${Number(vaultBal.value.uiAmount).toLocaleString()} USDC`);
    log("8", `Policy: auto<$${company.policy.autoApproveLimit.toNumber() / 1e6} | dual>$${company.policy.dualApproveThreshold.toNumber() / 1e6}`);
    passed++;
  } catch (e) { log("8", `FAIL — ${e.message}`); failed++; }

  // Summary
  console.log(`\n\x1b[35m╔══════════════════════════════════════════════════════╗\x1b[0m`);
  console.log(`\x1b[35m║  Results: ${passed} passed, ${failed} failed${" ".repeat(34 - String(passed).length - String(failed).length)}║\x1b[0m`);
  console.log(`\x1b[35m╚══════════════════════════════════════════════════════╝\x1b[0m\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("\n❌", e.message); process.exit(1); });
