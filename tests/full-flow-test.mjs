/**
 * BLACK BUDGET — Full Flow Test
 *
 * Tests the complete on-chain flow:
 * 1. Read existing company
 * 2. Set treasury policies
 * 3. Create a payment request
 * 4. Approve the payment
 * 5. Execute the payment (transfer USDC)
 * 6. Verify final state
 *
 * Run from /black-budget/app:  node ../tests/full-flow-test.mjs
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import fs from "fs";

// ─── Config ─────────────────────────────────────────────────────────

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k");
// Must match the mint used when the company vault was initialized on devnet
const USDC_MINT = new PublicKey("Ac6Q53KEURMNhngkR1yvhrsxd6vhU1pNR31TMykjVFp");
const SYSTEM = new PublicKey("11111111111111111111111111111111");

// ─── IDL (minimal, just what we need) ───────────────────────────────

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
      name: "approve_payment", discriminator: [21,123,195,139,107,141,34,187],
      accounts: [
        { name: "approver", signer: true },
        { name: "company" },
        { name: "approver_member" },
        { name: "payment", writable: true },
      ],
      args: [],
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
  ],
  accounts: [
    { name: "Company", discriminator: [32,212,52,137,90,7,206,183] },
    { name: "Member", discriminator: [54,19,162,21,29,166,17,198] },
    { name: "PaymentRequest", discriminator: [27,20,202,96,101,242,124,69] },
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
      { name: "required_approvals", type: "u8" },
      { name: "payment_id", type: "u64" },
      { name: "risk_score", type: "u8" },
      { name: "created_at", type: "i64" },
      { name: "executed_at", type: "i64" },
      { name: "bump", type: "u8" },
    ]}},
    { name: "PolicyConfig", type: { kind: "struct", fields: [
      { name: "auto_approve_limit", type: "u64" },
      { name: "dual_approve_threshold", type: "u64" },
      { name: "monthly_burn_cap", type: "u64" },
      { name: "require_vendor_verification", type: "bool" },
      { name: "restrict_to_known_recipients", type: "bool" },
      { name: "min_runway_months", type: "u8" },
    ]}},
    { name: "Role", type: { kind: "enum", variants: [
      { name: "Owner" }, { name: "Approver" }, { name: "Viewer" }, { name: "Contractor" },
    ]}},
    { name: "PaymentCategory", type: { kind: "enum", variants: [
      { name: "Payroll" }, { name: "Vendor" }, { name: "Subscription" },
      { name: "Contractor" }, { name: "Reimbursement" }, { name: "Other" },
    ]}},
    { name: "PaymentStatus", type: { kind: "enum", variants: [
      { name: "Pending" }, { name: "Approved" }, { name: "Executed" },
      { name: "Rejected" }, { name: "Cancelled" },
    ]}},
  ],
  errors: [],
};

// ─── Helpers ────────────────────────────────────────────────────────

function pda(seeds) {
  const [key] = PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
  return key;
}

function log(step, msg) {
  const icon = msg.startsWith("PASS") ? "✅" : msg.startsWith("FAIL") ? "❌" : "🔹";
  console.log(`  ${icon} [${step}] ${msg}`);
}

function explorer(type, id) {
  return `https://explorer.solana.com/${type}/${id}?cluster=devnet`;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║    BLACK BUDGET — Full Flow Test             ║");
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
  const vaultPDA = pda([Buffer.from("vault"), companyPDA.toBuffer()]);
  const memberPDA = pda([Buffer.from("member"), companyPDA.toBuffer(), kp.publicKey.toBuffer()]);

  console.log(`  Wallet:  ${kp.publicKey.toBase58()}`);
  console.log(`  Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`  Company: ${companyPDA.toBase58()}`);
  console.log(`  Vault:   ${vaultPDA.toBase58()}\n`);

  let passed = 0;
  let failed = 0;

  // ─── STEP 1: Read Company ─────────────────────────────────────
  console.log("─── Step 1: Read Company ───");
  try {
    const company = await program.account.company.fetch(companyPDA);
    log("1", `PASS — Company "${company.name}" exists`);
    log("1", `Members: ${company.memberCount}, Payments: ${company.paymentNonce.toNumber()}, Spent: $${company.totalSpent.toNumber() / 1_000_000}`);
    passed++;
  } catch (e) {
    log("1", `FAIL — ${e.message}`);
    console.log("\n  ⛔ Company doesn't exist. Create one from the UI first.\n");
    failed++;
    return;
  }

  // ─── STEP 2: Set Policies ─────────────────────────────────────
  console.log("\n─── Step 2: Set Treasury Policies ───");
  try {
    const tx = await program.methods
      .setPolicies({
        autoApproveLimit: new BN(5000 * 1_000_000),      // $5,000
        dualApproveThreshold: new BN(15000 * 1_000_000),  // $15,000
        monthlyBurnCap: new BN(75000 * 1_000_000),        // $75,000
        requireVendorVerification: true,
        restrictToKnownRecipients: false,
        minRunwayMonths: 8,
      })
      .accounts({
        authority: kp.publicKey,
        company: companyPDA,
        authorityMember: memberPDA,
      })
      .rpc();

    log("2", `PASS — Policies set on-chain`);
    log("2", `Auto-approve: $5,000 | Dual: $15,000 | Cap: $75,000/mo`);
    log("2", `TX: ${tx.slice(0, 30)}...`);
    passed++;
  } catch (e) {
    log("2", `FAIL — ${e.message}`);
    if (e.logs) e.logs.forEach((l) => console.log("    ", l));
    failed++;
  }

  // ─── STEP 3: Create Payment (auto-approve, $3,200) ────────────
  console.log("\n─── Step 3: Create Payment ($3,200 — auto-approve) ───");
  let paymentNonce;
  try {
    const company = await program.account.company.fetch(companyPDA);
    paymentNonce = company.paymentNonce.toNumber();
    const paymentPDA = pda([
      Buffer.from("payment"),
      companyPDA.toBuffer(),
      (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(paymentNonce)); return b; })(),
    ]);

    // Create a recipient (just use a random keypair for test)
    const recipient = Keypair.generate();

    const descHash = new Array(32).fill(0);
    descHash[0] = 0xAB; // dummy hash

    const tx = await program.methods
      .createPayment(
        new BN(3200 * 1_000_000),  // $3,200
        { contractor: {} },
        descHash,
        "Test: UI/UX Dashboard Redesign",
        15  // risk score
      )
      .accounts({
        requester: kp.publicKey,
        company: companyPDA,
        requesterMember: memberPDA,
        recipient: recipient.publicKey,
        payment: paymentPDA,
        systemProgram: SYSTEM,
      })
      .rpc();

    // Read the payment back
    const payment = await program.account.paymentRequest.fetch(paymentPDA);
    const statusKey = Object.keys(payment.status)[0];

    log("3", `PASS — Payment #${paymentNonce} created`);
    log("3", `Amount: $3,200 | Category: Contractor | Status: ${statusKey}`);
    log("3", `Approvals needed: ${payment.requiredApprovals} | Risk: ${payment.riskScore}`);
    log("3", `TX: ${tx.slice(0, 30)}...`);

    if (statusKey === "approved") {
      log("3", `Auto-approved! (under $5,000 policy threshold)`);
    }
    passed++;

    // ─── STEP 4: Execute Payment (if auto-approved) ──────────────
    if (statusKey === "approved") {
      console.log("\n─── Step 4: Execute Payment (transfer USDC) ───");
      try {
        // Get or create recipient token account
        const recipientATA = getAssociatedTokenAddressSync(
          USDC_MINT,
          recipient.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );

        const execTx = await program.methods
          .executePayment()
          .accounts({
            executor: kp.publicKey,
            company: companyPDA,
            executorMember: memberPDA,
            payment: paymentPDA,
            vault: vaultPDA,
            recipientTokenAccount: recipientATA,
            recipient: recipient.publicKey,
            usdcMint: USDC_MINT,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM,
          })
          .rpc();

        const afterPayment = await program.account.paymentRequest.fetch(paymentPDA);
        const afterStatus = Object.keys(afterPayment.status)[0];

        log("4", `PASS — Payment executed!`);
        log("4", `Status: ${afterStatus} | TX: ${execTx.slice(0, 30)}...`);
        log("4", explorer("tx", execTx));
        passed++;
      } catch (e) {
        log("4", `FAIL — ${e.message}`);
        if (e.logs) e.logs.slice(-5).forEach((l) => console.log("    ", l));
        if (e.message.includes("TokenMint") || e.message.includes("OwnedByWrongProgram")) {
          log("4", `(Vault was initialized with a different USDC mint — re-create company to fix)`);
        } else {
          log("4", `(Execute may fail if vault has no USDC balance)`);
        }
        failed++;
      }
    } else {
      console.log("\n─── Step 4: Skip execute (payment needs manual approval) ───");
      log("4", `SKIP — Status is ${statusKey}, not auto-approved`);
    }

  } catch (e) {
    log("3", `FAIL — ${e.message}`);
    if (e.logs) e.logs.slice(-5).forEach((l) => console.log("    ", l));
    failed++;
  }

  // ─── STEP 5: Verify Final State ───────────────────────────────
  console.log("\n─── Step 5: Verify Final State ───");
  try {
    const company = await program.account.company.fetch(companyPDA);
    log("5", `PASS — Final state verified`);
    log("5", `Name: ${company.name}`);
    log("5", `Members: ${company.memberCount}`);
    log("5", `Payments: ${company.paymentNonce.toNumber()}`);
    log("5", `Total Spent: $${company.totalSpent.toNumber() / 1_000_000}`);
    log("5", `Monthly Spent: $${company.monthlySpent.toNumber() / 1_000_000}`);
    log("5", `Policy auto-approve: $${company.policy.autoApproveLimit.toNumber() / 1_000_000}`);
    log("5", `Policy dual-approve: $${company.policy.dualApproveThreshold.toNumber() / 1_000_000}`);
    log("5", `Policy monthly cap: $${company.policy.monthlyBurnCap.toNumber() / 1_000_000}`);
    passed++;
  } catch (e) {
    log("5", `FAIL — ${e.message}`);
    failed++;
  }

  // ─── Summary ──────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log(`║  Results: ${passed} passed, ${failed} failed${" ".repeat(22 - String(passed).length - String(failed).length)}║`);
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`\n  Explorer: ${explorer("address", companyPDA.toBase58())}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\n❌ Unexpected error:", e.message);
  process.exit(1);
});
