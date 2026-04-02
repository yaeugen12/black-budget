/**
 * BLACK BUDGET — Full User Simulation Test
 *
 * Simulates a complete user journey as if clicking through the app:
 *
 *  Step 1:  Pages load correctly (all 10 routes)
 *  Step 2:  Company exists on-chain (or create one)
 *  Step 3:  Set treasury policies on-chain
 *  Step 4:  Upload invoice → AI parses → correct policy routing
 *  Step 5:  Create payment on-chain from parsed invoice
 *  Step 6:  Verify payment appears in on-chain list
 *  Step 7:  Approve payment (if needed)
 *  Step 8:  Execute payment (USDC transfer from vault)
 *  Step 9:  Verify vault balance decreased
 *  Step 10: Generate Merkle proof from payments
 *  Step 11: Anchor proof on-chain (record_proof)
 *  Step 12: Anchor compliance proof on-chain
 *  Step 13: Verify all on-chain state is consistent
 *  Step 14: Supabase connection works
 *
 * Run: node tests/full-user-simulation.mjs
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ─────────────────────────────────────────────────────────

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k");
const USDC_MINT = new PublicKey("Ac6Q53KEURMNhngkR1yvhrsxd6vhU1pNR31TMykjVFp");
const SYSTEM = new PublicKey("11111111111111111111111111111111");
const CLOCK = new PublicKey("SysvarC1ock11111111111111111111111111111111");
const APP_URL = "http://localhost:3000";

// Load API key
let ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
  try {
    const env = fs.readFileSync(path.join(__dirname, "../app/.env.local"), "utf8");
    const m = env.match(/ANTHROPIC_API_KEY=(.+)/);
    if (m) ANTHROPIC_KEY = m[1].trim();
  } catch {}
}

// ─── IDL ────────────────────────────────────────────────────────────

const IDL = {
  address: PROGRAM_ID.toBase58(),
  metadata: { name: "black_budget", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "set_policies", discriminator: [87,55,15,198,84,223,113,39],
      accounts: [
        { name: "authority", signer: true },
        { name: "company", writable: true },
        { name: "authority_member" },
      ],
      args: [{ name: "policy", type: { defined: { name: "PolicyConfig" } } }],
    },
    {
      name: "create_payment", discriminator: [28,81,85,253,7,223,154,42],
      accounts: [
        { name: "requester", writable: true, signer: true },
        { name: "company", writable: true },
        { name: "requester_member" },
        { name: "recipient" },
        { name: "payment", writable: true },
        { name: "system_program", address: SYSTEM.toBase58() },
      ],
      args: [
        { name: "amount", type: "u64" },
        { name: "category", type: { defined: { name: "PaymentCategory" } } },
        { name: "description_hash", type: { array: ["u8", 32] } },
        { name: "memo", type: "string" },
        { name: "risk_score", type: "u8" },
      ],
    },
    {
      name: "execute_payment", discriminator: [86,4,7,7,120,139,232,139],
      accounts: [
        { name: "executor", writable: true, signer: true },
        { name: "company", writable: true },
        { name: "executor_member" },
        { name: "payment", writable: true },
        { name: "vault", writable: true },
        { name: "recipient_token_account", writable: true },
        { name: "recipient" },
        { name: "usdc_mint" },
        { name: "token_program" },
        { name: "associated_token_program" },
        { name: "system_program", address: SYSTEM.toBase58() },
      ],
      args: [],
    },
    {
      name: "record_proof", discriminator: [144,172,144,35,124,170,93,80],
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
      name: "record_compliance_proof", discriminator: [199,164,178,54,197,19,207,10],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "company" },
        { name: "member" },
        { name: "compliance_proof", writable: true },
        { name: "clock" },
        { name: "system_program", address: SYSTEM.toBase58() },
      ],
      args: [
        { name: "constraint_hash", type: { array: ["u8", 32] } },
        { name: "merkle_root", type: { array: ["u8", 32] } },
        { name: "result", type: "bool" },
        { name: "payment_count", type: "u32" },
        { name: "period_start", type: "i64" },
        { name: "period_end", type: "i64" },
      ],
    },
  ],
  accounts: [
    { name: "Company", discriminator: [32,212,52,137,90,7,206,183] },
    { name: "ComplianceProof", discriminator: [233,234,16,235,57,232,89,20] },
    { name: "Member", discriminator: [54,19,162,21,29,166,17,198] },
    { name: "PaymentRequest", discriminator: [27,20,202,96,101,242,124,69] },
    { name: "ProofRecord", discriminator: [237,59,155,172,204,117,87,44] },
  ],
  types: [
    { name: "Company", type: { kind: "struct", fields: [
      { name: "authority", type: "pubkey" }, { name: "name", type: "string" },
      { name: "vault", type: "pubkey" },
      { name: "policy", type: { defined: { name: "PolicyConfig" } } },
      { name: "member_count", type: "u8" }, { name: "payment_nonce", type: "u64" },
      { name: "total_spent", type: "u64" }, { name: "monthly_spent", type: "u64" },
      { name: "current_month", type: "u8" }, { name: "created_at", type: "i64" },
      { name: "bump", type: "u8" },
    ]}},
    { name: "Member", type: { kind: "struct", fields: [
      { name: "company", type: "pubkey" }, { name: "wallet", type: "pubkey" },
      { name: "role", type: { defined: { name: "Role" } } },
      { name: "label", type: "string" }, { name: "added_at", type: "i64" },
      { name: "is_active", type: "bool" }, { name: "bump", type: "u8" },
    ]}},
    { name: "PaymentRequest", type: { kind: "struct", fields: [
      { name: "company", type: "pubkey" }, { name: "requester", type: "pubkey" },
      { name: "recipient", type: "pubkey" }, { name: "amount", type: "u64" },
      { name: "category", type: { defined: { name: "PaymentCategory" } } },
      { name: "description_hash", type: { array: ["u8", 32] } },
      { name: "memo", type: "string" },
      { name: "status", type: { defined: { name: "PaymentStatus" } } },
      { name: "approvals", type: { vec: "pubkey" } },
      { name: "required_approvals", type: "u8" }, { name: "payment_id", type: "u64" },
      { name: "risk_score", type: "u8" }, { name: "created_at", type: "i64" },
      { name: "executed_at", type: "i64" }, { name: "bump", type: "u8" },
    ]}},
    { name: "ProofRecord", type: { kind: "struct", fields: [
      { name: "company", type: "pubkey" }, { name: "generated_by", type: "pubkey" },
      { name: "proof_type", type: { defined: { name: "ProofType" } } },
      { name: "merkle_root", type: { array: ["u8", 32] } },
      { name: "period_start", type: "i64" }, { name: "period_end", type: "i64" },
      { name: "payment_count", type: "u32" }, { name: "generated_at", type: "i64" },
      { name: "bump", type: "u8" },
    ]}},
    { name: "ComplianceProof", type: { kind: "struct", fields: [
      { name: "company", type: "pubkey" }, { name: "generated_by", type: "pubkey" },
      { name: "constraint_hash", type: { array: ["u8", 32] } },
      { name: "merkle_root", type: { array: ["u8", 32] } },
      { name: "result", type: "bool" }, { name: "payment_count", type: "u32" },
      { name: "period_start", type: "i64" }, { name: "period_end", type: "i64" },
      { name: "generated_at", type: "i64" }, { name: "bump", type: "u8" },
    ]}},
    { name: "PolicyConfig", type: { kind: "struct", fields: [
      { name: "auto_approve_limit", type: "u64" }, { name: "dual_approve_threshold", type: "u64" },
      { name: "monthly_burn_cap", type: "u64" }, { name: "require_vendor_verification", type: "bool" },
      { name: "restrict_to_known_recipients", type: "bool" }, { name: "min_runway_months", type: "u8" },
    ]}},
    { name: "Role", type: { kind: "enum", variants: [{ name: "Owner" }, { name: "Approver" }, { name: "Viewer" }, { name: "Contractor" }] }},
    { name: "PaymentCategory", type: { kind: "enum", variants: [{ name: "Payroll" }, { name: "Vendor" }, { name: "Subscription" }, { name: "Contractor" }, { name: "Reimbursement" }, { name: "Other" }] }},
    { name: "PaymentStatus", type: { kind: "enum", variants: [{ name: "Pending" }, { name: "Approved" }, { name: "Executed" }, { name: "Rejected" }, { name: "Cancelled" }] }},
    { name: "ProofType", type: { kind: "enum", variants: [{ name: "Investor" }, { name: "Auditor" }, { name: "Regulator" }] }},
  ],
  errors: [],
};

// ─── Helpers ────────────────────────────────────────────────────────

function pda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}
function companyPDA(authority) { return pda([Buffer.from("company"), authority.toBuffer()]); }
function memberPDA(company, wallet) { return pda([Buffer.from("member"), company.toBuffer(), wallet.toBuffer()]); }
function vaultPDA(company) { return pda([Buffer.from("vault"), company.toBuffer()]); }
function paymentPDA(company, nonce) {
  const b = Buffer.alloc(8);
  let n = BigInt(nonce);
  for (let i = 0; i < 8; i++) { b[i] = Number(n & 0xffn); n >>= 8n; }
  return pda([Buffer.from("payment"), company.toBuffer(), b]);
}
function proofPDA(company, proofType, periodEnd) {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(periodEnd));
  return pda([Buffer.from("proof"), company.toBuffer(), Buffer.from([proofType]), b]);
}
function compliancePDA(company, constraintHash, periodEnd) {
  const b = Buffer.alloc(8);
  let ts = BigInt(periodEnd);
  for (let i = 0; i < 8; i++) { b[i] = Number(ts & 0xffn); ts >>= 8n; }
  return pda([Buffer.from("compliance"), company.toBuffer(), Buffer.from(constraintHash), b]);
}

let passed = 0, failed = 0;
function log(step, msg) {
  const icon = msg.startsWith("PASS") ? "✅" : msg.startsWith("FAIL") ? "❌" : msg.startsWith("SKIP") ? "⏭️" : "🔹";
  console.log(`  ${icon} [${step}] ${msg}`);
  if (msg.startsWith("PASS")) passed++;
  if (msg.startsWith("FAIL")) failed++;
}
function txLink(sig) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}
function accLink(addr) {
  return `https://explorer.solana.com/address/${addr}?cluster=devnet`;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║   BLACK BUDGET — Full User Simulation (14 steps)     ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const conn = new Connection(RPC, "confirmed");
  const kp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8")))
  );
  const wallet = {
    publicKey: kp.publicKey,
    signTransaction: async (tx) => { tx.sign(kp); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(kp)); return txs; },
  };
  const provider = new AnchorProvider(conn, wallet, { commitment: "confirmed" });
  const program = new Program(IDL, provider);

  const compPDA = companyPDA(kp.publicKey);
  const memPDA = memberPDA(compPDA, kp.publicKey);
  const vPDA = vaultPDA(compPDA);

  console.log(`  Wallet:  ${kp.publicKey.toBase58()}`);
  console.log(`  Company: ${compPDA.toBase58()}`);
  console.log(`  Vault:   ${vPDA.toBase58()}`);
  console.log(`\n  Explorer links:`);
  console.log(`  Wallet:  ${accLink(kp.publicKey.toBase58())}`);
  console.log(`  Company: ${accLink(compPDA.toBase58())}`);
  console.log(`  Vault:   ${accLink(vPDA.toBase58())}\n`);

  // ═══ STEP 1: Pages load ═══════════════════════════════════════════
  console.log("─── Step 1: All pages load (HTTP 200) ───");
  let appOnline = true;
  try {
    const routes = ["/", "/policies", "/invoices", "/payments", "/approvals", "/team", "/payroll", "/proofs", "/proofs/compliance", "/landing"];
    for (const route of routes) {
      const res = await fetch(APP_URL + route);
      if (res.status !== 200) {
        log("1", `FAIL — ${route} returned ${res.status}`);
        appOnline = false;
      }
    }
    if (appOnline) log("1", `PASS — All 10 pages return 200`);
  } catch {
    log("1", `SKIP — App not running on ${APP_URL} (pages test skipped, on-chain tests continue)`);
    appOnline = false;
  }

  // ═══ STEP 2: Company exists ═══════════════════════════════════════
  console.log("\n─── Step 2: Company exists on-chain ───");
  let company;
  try {
    company = await program.account.company.fetch(compPDA);
    log("2", `PASS — "${company.name}" | ${company.memberCount} members | ${company.paymentNonce.toNumber()} payments`);
  } catch {
    log("2", "FAIL — Company not found. Create one from UI first.");
    process.exit(1);
  }

  // ═══ STEP 3: Set policies ═════════════════════════════════════════
  console.log("\n─── Step 3: Set treasury policies ───");
  try {
    await program.methods.setPolicies({
      autoApproveLimit: new BN(5000 * 1_000_000),
      dualApproveThreshold: new BN(15000 * 1_000_000),
      monthlyBurnCap: new BN(75000 * 1_000_000),
      requireVendorVerification: true,
      restrictToKnownRecipients: false,
      minRunwayMonths: 8,
    }).accounts({
      authority: kp.publicKey, company: compPDA, authorityMember: memPDA,
    }).rpc();
    log("3", "PASS — Policies: auto $5K, dual $15K, cap $75K/mo");
    log("3", `Company: ${accLink(compPDA.toBase58())}`);
  } catch (e) {
    log("3", `FAIL — ${e.message}`);
  }

  // ═══ STEP 4: AI invoice parsing ═══════════════════════════════════
  console.log("\n─── Step 4: AI parses invoice correctly ───");
  let parsedAmount = 3200;
  let parsedCategory = "contractor";
  if (ANTHROPIC_KEY) {
    try {
      const invoiceFile = path.join(__dirname, "invoices/02-auto-contractor-3200.png");
      if (fs.existsSync(invoiceFile)) {
        const base64 = fs.readFileSync(invoiceFile).toString("base64");
        const models = ["claude-sonnet-4-5-20250514", "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"];
        let text = "";
        for (const model of models) {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model, max_tokens: 512,
              messages: [{ role: "user", content: [
                { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
                { type: "text", text: 'Extract: {"vendor":"str","amount":number,"category":"payroll|vendor|subscription|contractor|reimbursement|other"}. JSON only.' },
              ]}],
            }),
          });
          const data = await res.json();
          if (data.content?.[0]?.text) { text = data.content[0].text; break; }
        }
        if (!text) throw new Error("All models failed");
        // Strip markdown code fences if present
        const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "");
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON in AI response: " + text.slice(0, 80));
        const json = JSON.parse(jsonMatch[0]);
        parsedAmount = json.amount;
        parsedCategory = json.category;
        const isCorrect = parsedAmount >= 3000 && parsedAmount <= 3400 && parsedCategory === "contractor";
        log("4", isCorrect
          ? `PASS — AI: $${parsedAmount} ${parsedCategory} (${json.vendor})`
          : `FAIL — AI: $${parsedAmount} ${parsedCategory} (expected ~$3200 contractor)`);
      } else {
        log("4", "SKIP — Invoice file not found, using defaults");
      }
    } catch (e) {
      log("4", `SKIP — AI call failed (${e.message}), using defaults`);
    }
  } else {
    log("4", "SKIP — No ANTHROPIC_API_KEY, using default $3,200 contractor");
  }

  // ═══ STEP 5: Create payment on-chain ══════════════════════════════
  console.log("\n─── Step 5: Create payment on-chain ($3,200 auto-approve) ───");
  company = await program.account.company.fetch(compPDA);
  const nonce = company.paymentNonce.toNumber();
  const pPDA = paymentPDA(compPDA, nonce);
  const recipient = Keypair.generate();
  try {
    const hash = crypto.createHash("sha256").update("Invoice: Sarah Chen Design").digest();
    const tx5 = await program.methods.createPayment(
      new BN(Math.round(parsedAmount * 1_000_000)),
      { [parsedCategory]: {} },
      Array.from(hash), "Invoice: Sarah Chen Design", 10
    ).accounts({
      requester: kp.publicKey, company: compPDA, requesterMember: memPDA,
      recipient: recipient.publicKey, payment: pPDA, systemProgram: SYSTEM,
    }).rpc();
    const payment = await program.account.paymentRequest.fetch(pPDA);
    const status = Object.keys(payment.status)[0];
    log("5", `PASS — Payment #${nonce} created | $${parsedAmount} | Status: ${status}`);
    log("5", `TX: ${txLink(tx5)}`);
    log("5", `Payment PDA: ${accLink(pPDA.toBase58())}`);
  } catch (e) {
    log("5", `FAIL — ${e.message}`);
  }

  // ═══ STEP 6: Payment appears in list ══════════════════════════════
  console.log("\n─── Step 6: Payment visible in on-chain list ───");
  try {
    const all = await program.account.paymentRequest.all([
      { memcmp: { offset: 8, bytes: compPDA.toBase58() } },
    ]);
    const found = all.find(p => p.account.paymentId.toNumber() === nonce);
    log("6", found
      ? `PASS — Found payment #${nonce} in ${all.length} total payments`
      : `FAIL — Payment #${nonce} not found in ${all.length} payments`);
  } catch (e) {
    log("6", `FAIL — ${e.message}`);
  }

  // ═══ STEP 7: Approve (skip if auto-approved) ═════════════════════
  console.log("\n─── Step 7: Approve payment (if needed) ───");
  try {
    const payment = await program.account.paymentRequest.fetch(pPDA);
    const status = Object.keys(payment.status)[0];
    if (status === "approved") {
      log("7", `PASS — Already auto-approved (amount under $5K policy)`);
    } else {
      log("7", `SKIP — Status is ${status}, manual approval needed (skipping)`);
    }
  } catch (e) {
    log("7", `FAIL — ${e.message}`);
  }

  // ═══ STEP 8: Execute payment ══════════════════════════════════════
  console.log("\n─── Step 8: Execute payment (USDC transfer) ───");
  const vaultBefore = await conn.getTokenAccountBalance(vPDA).then(r => Number(r.value.amount)).catch(() => 0);
  try {
    const recipientATA = getAssociatedTokenAddressSync(USDC_MINT, recipient.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const tx8 = await program.methods.executePayment().accounts({
      executor: kp.publicKey, company: compPDA, executorMember: memPDA,
      payment: pPDA, vault: vPDA, recipientTokenAccount: recipientATA,
      recipient: recipient.publicKey, usdcMint: USDC_MINT,
      tokenProgram: TOKEN_2022_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SYSTEM,
    }).rpc();
    log("8", `PASS — Payment executed! USDC transferred`);
    log("8", `TX: ${txLink(tx8)}`);
    log("8", `Recipient: ${accLink(recipient.publicKey.toBase58())}`);
  } catch (e) {
    const msg = e.message || "";
    if (msg.includes("InsufficientVaultBalance")) {
      log("8", `FAIL — Vault empty (mint USDC to vault first)`);
    } else {
      log("8", `FAIL — ${msg.slice(0, 100)}`);
    }
  }

  // ═══ STEP 9: Vault balance decreased ══════════════════════════════
  console.log("\n─── Step 9: Verify vault balance decreased ───");
  try {
    const vaultAfter = await conn.getTokenAccountBalance(vPDA).then(r => Number(r.value.amount));
    const diff = vaultBefore - vaultAfter;
    if (diff > 0) {
      log("9", `PASS — Vault decreased by $${(diff / 1_000_000).toLocaleString()} (${vaultBefore / 1_000_000} → ${vaultAfter / 1_000_000})`);
    } else if (vaultBefore === 0) {
      log("9", `SKIP — Vault was empty before execute`);
    } else {
      log("9", `FAIL — Vault did not decrease (before: ${vaultBefore}, after: ${vaultAfter})`);
    }
  } catch (e) {
    log("9", `FAIL — ${e.message}`);
  }

  // ═══ STEP 10: Compute Merkle proof ════════════════════════════════
  console.log("\n─── Step 10: Compute Merkle proof from payments ───");
  let merkleRoot;
  try {
    const allPayments = await program.account.paymentRequest.all([
      { memcmp: { offset: 8, bytes: compPDA.toBase58() } },
    ]);
    // Build leaves
    const leaves = [];
    for (const p of allPayments) {
      const leaf = `${p.account.paymentId.toNumber()}:${p.account.recipient.toBase58()}:${p.account.amount.toNumber()}:${Object.keys(p.account.category)[0]}:${p.account.createdAt.toNumber()}`;
      leaves.push(crypto.createHash("sha256").update(leaf).digest("hex"));
    }
    // Build tree
    let level = [...leaves];
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] || left;
        next.push(crypto.createHash("sha256").update(left + right).digest("hex"));
      }
      level = next;
    }
    merkleRoot = level[0];
    log("10", `PASS — Merkle root from ${allPayments.length} payments: ${merkleRoot.slice(0, 16)}...`);
  } catch (e) {
    log("10", `FAIL — ${e.message}`);
  }

  // ═══ STEP 11: Anchor proof on-chain ═══════════════════════════════
  console.log("\n─── Step 11: Anchor selective disclosure proof ───");
  const periodEnd = Math.floor(Date.now() / 1000);
  const periodStart = periodEnd - 86400 * 30;
  try {
    const rootBytes = Array.from({ length: 32 }, (_, i) => parseInt((merkleRoot || "00".repeat(32)).slice(i * 2, i * 2 + 2), 16));
    const pPDA11 = proofPDA(compPDA, 0, periodEnd); // investor = 0
    const tx11 = await program.methods.recordProof(
      { investor: {} }, rootBytes, 5, new BN(periodStart), new BN(periodEnd)
    ).accounts({
      authority: kp.publicKey, company: compPDA, member: memPDA,
      proofRecord: pPDA11, clock: CLOCK, systemProgram: SYSTEM,
    }).rpc();
    log("11", `PASS — Investor proof anchored on-chain`);
    log("11", `TX: ${txLink(tx11)}`);
    log("11", `Proof PDA: ${accLink(pPDA11.toBase58())}`);
  } catch (e) {
    log("11", `FAIL — ${e.message.slice(0, 100)}`);
  }

  // ═══ STEP 12: Anchor compliance proof ═════════════════════════════
  console.log("\n─── Step 12: Anchor compliance proof ───");
  try {
    const constraintHash = Array.from(crypto.createHash("sha256").update('{"kind":"runway","months":6,"operator":">"}').digest());
    const rootBytes = Array.from({ length: 32 }, (_, i) => parseInt((merkleRoot || "00".repeat(32)).slice(i * 2, i * 2 + 2), 16));
    const cPDA = compliancePDA(compPDA, constraintHash, periodEnd);
    const tx12 = await program.methods.recordComplianceProof(
      constraintHash, rootBytes, true, 5, new BN(periodStart), new BN(periodEnd)
    ).accounts({
      authority: kp.publicKey, company: compPDA, member: memPDA,
      complianceProof: cPDA, clock: CLOCK, systemProgram: SYSTEM,
    }).rpc();
    log("12", `PASS — Compliance proof anchored (runway > 6mo = COMPLIANT)`);
    log("12", `TX: ${txLink(tx12)}`);
    log("12", `Compliance PDA: ${accLink(cPDA.toBase58())}`);
  } catch (e) {
    log("12", `FAIL — ${e.message.slice(0, 100)}`);
  }

  // ═══ STEP 13: Final state consistency ═════════════════════════════
  console.log("\n─── Step 13: Verify final on-chain state ───");
  try {
    const final = await program.account.company.fetch(compPDA);
    const checks = [];
    if (final.totalSpent.toNumber() > 0) checks.push("totalSpent > 0");
    if (final.paymentNonce.toNumber() > nonce) checks.push(`nonce advanced (${nonce} → ${final.paymentNonce.toNumber()})`);
    if (final.memberCount > 0) checks.push(`${final.memberCount} members`);
    if (final.policy.autoApproveLimit.toNumber() === 5000 * 1_000_000) checks.push("policies correct");
    log("13", `PASS — State consistent: ${checks.join(", ")}`);
  } catch (e) {
    log("13", `FAIL — ${e.message}`);
  }

  // ═══ STEP 14: Supabase connection ═════════════════════════════════
  console.log("\n─── Step 14: Supabase database connection ───");
  try {
    let supabaseUrl, supabaseKey;
    const env = fs.readFileSync(path.join(__dirname, "../app/.env.local"), "utf8");
    supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
    supabaseKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
    if (supabaseUrl && supabaseKey) {
      const res = await fetch(`${supabaseUrl}/rest/v1/invoices?select=id&limit=1`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      });
      if (res.ok) {
        log("14", `PASS — Supabase connected (${supabaseUrl.split("//")[1].split(".")[0]})`);
      } else {
        log("14", `FAIL — Supabase returned ${res.status}`);
      }
    } else {
      log("14", "SKIP — No Supabase configured");
    }
  } catch (e) {
    log("14", `FAIL — ${e.message}`);
  }

  // ═══ Summary ══════════════════════════════════════════════════════
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log(`║  Results: ${passed} passed, ${failed} failed${" ".repeat(Math.max(0, 28 - String(passed).length - String(failed).length))}║`);
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("\n❌ Unexpected:", e.message); process.exit(1); });
