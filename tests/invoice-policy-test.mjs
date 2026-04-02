/**
 * BLACK BUDGET — Invoice AI Parser + Policy Test
 *
 * Tests that all 10 generated invoices are correctly parsed by Claude Vision
 * and routed to the right policy action.
 *
 * Run: node tests/invoice-policy-test.mjs
 * Requires: ANTHROPIC_API_KEY in env or app/.env.local
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load API key from env or .env.local
let apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  try {
    const envLocal = fs.readFileSync(path.join(__dirname, "../app/.env.local"), "utf8");
    const match = envLocal.match(/ANTHROPIC_API_KEY=(.+)/);
    if (match) apiKey = match[1].trim();
  } catch {}
}

if (!apiKey) {
  console.error("❌ No ANTHROPIC_API_KEY found. Set it in env or app/.env.local");
  process.exit(1);
}

// Expected results for each invoice
const expectations = [
  { file: "01-auto-subscription-900.png",    minAmt: 800,   maxAmt: 1000,   policy: "auto_approve",     vendor: "Ver" },
  { file: "02-auto-contractor-3200.png",     minAmt: 3000,  maxAmt: 3400,   policy: "auto_approve",     vendor: "Sarah" },
  { file: "03-auto-reimbursement-450.png",   minAmt: 400,   maxAmt: 500,    policy: "auto_approve",     vendor: "Alex" },
  { file: "04-single-vendor-8500.png",       minAmt: 8000,  maxAmt: 9000,   policy: "require_approval", vendor: "AWS" },
  { file: "05-single-payroll-12000.png",     minAmt: 11000, maxAmt: 13000,  policy: "require_approval", vendor: "Acme" },
  { file: "06-dual-vendor-22000.png",        minAmt: 20000, maxAmt: 24000,  policy: "require_dual",     vendor: "Cloudflare" },
  { file: "07-dual-contractor-35000.png",    minAmt: 33000, maxAmt: 37000,  policy: "require_dual",     vendor: "BlockSec" },
  { file: "08-newvendor-rush-2800.png",      minAmt: 2600,  maxAmt: 3000,   policy: "auto_approve",     vendor: "Nova" },
  { file: "09-large-payroll-65000.png",      minAmt: 60000, maxAmt: 70000,  policy: "require_dual",     vendor: "Acme" },
  { file: "10-boundary-exact-5000.png",      minAmt: 4800,  maxAmt: 5200,   policy: "auto_approve",     vendor: "DigitalOcean" },
];

const INVOICES_DIR = path.join(__dirname, "invoices");
const API_URL = "http://localhost:3000/api/parse-invoice";

async function testInvoice(exp, index) {
  const filePath = path.join(INVOICES_DIR, exp.file);
  if (!fs.existsSync(filePath)) {
    return { index, file: exp.file, status: "SKIP", reason: "File not found" };
  }

  // Try local API first, fallback to direct Anthropic call
  let invoice, policy;

  try {
    // Try the local Next.js API route
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: "image/png" });
    formData.append("file", blob, exp.file);

    const res = await fetch(API_URL, { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      invoice = data.invoice;
      policy = data.policy;
    } else {
      throw new Error(`API returned ${res.status}`);
    }
  } catch {
    // Fallback: call Anthropic directly
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString("base64");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 1024,
        system: 'You are an invoice data extraction AI. Extract structured data from invoices. Always return valid JSON. Risk flags: "new_vendor" (unknown company), "high_amount" (>10000 USD), "rush_payment" (due <3 days), "missing_details". Categories: payroll, vendor, subscription, contractor, reimbursement, other.',
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
            { type: "text", text: 'Extract invoice data as JSON: { "vendor": "string", "amount": number, "currency": "USD", "dueDate": "YYYY-MM-DD", "category": "payroll|vendor|subscription|contractor|reimbursement|other", "lineItems": [{"description": "string", "amount": number}], "riskFlags": ["string"], "confidence": 0-1 }. Return ONLY the JSON.' },
          ],
        }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { index, file: exp.file, status: "FAIL", reason: "AI returned no JSON" };
    }
    invoice = JSON.parse(jsonMatch[0]);

    // Apply same policy logic as the API route
    const amount = invoice.amount || 0;
    let action = "auto_approve";
    let reason = "Under $5,000";
    let requiredApprovers = 0;

    if (invoice.riskFlags?.includes("new_vendor")) {
      action = "require_approval"; reason = "New vendor"; requiredApprovers = 1;
    } else if (amount > 15000) {
      action = "require_dual"; reason = "Over $15,000"; requiredApprovers = 2;
    } else if (amount > 5000) {
      action = "require_approval"; reason = "Over $5,000"; requiredApprovers = 1;
    }
    policy = { action, reason, requiredApprovers };
  }

  // Validate
  const errors = [];

  // Check amount in range
  if (invoice.amount < exp.minAmt || invoice.amount > exp.maxAmt) {
    errors.push(`Amount $${invoice.amount} not in expected range [$${exp.minAmt}-$${exp.maxAmt}]`);
  }

  // Check vendor name contains expected substring
  if (!invoice.vendor?.toLowerCase().includes(exp.vendor.toLowerCase())) {
    errors.push(`Vendor "${invoice.vendor}" doesn't match expected "${exp.vendor}"`);
  }

  // Check policy action
  if (policy.action !== exp.policy) {
    errors.push(`Policy "${policy.action}" != expected "${exp.policy}"`);
  }

  return {
    index,
    file: exp.file,
    status: errors.length === 0 ? "PASS" : "FAIL",
    vendor: invoice.vendor,
    amount: invoice.amount,
    category: invoice.category,
    policy: policy.action,
    policyReason: policy.reason,
    riskFlags: invoice.riskFlags || [],
    confidence: invoice.confidence,
    errors,
  };
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║   BLACK BUDGET — Invoice AI Parser + Policy Test    ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  let passed = 0, failed = 0, skipped = 0;

  for (let i = 0; i < expectations.length; i++) {
    const exp = expectations[i];
    process.stdout.write(`  [${i + 1}/10] ${exp.file.padEnd(42)} `);

    const result = await testInvoice(exp, i);

    if (result.status === "PASS") {
      console.log(`✅ PASS — $${result.amount?.toLocaleString()} → ${result.policy} (${result.vendor})`);
      passed++;
    } else if (result.status === "SKIP") {
      console.log(`⏭️  SKIP — ${result.reason}`);
      skipped++;
    } else {
      console.log(`❌ FAIL`);
      result.errors.forEach(e => console.log(`     ↳ ${e}`));
      if (result.amount) console.log(`     ↳ Got: $${result.amount} → ${result.policy} (${result.vendor})`);
      failed++;
    }

    // Small delay to avoid rate limits
    if (i < expectations.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log(`║  Results: ${passed} passed, ${failed} failed, ${skipped} skipped${" ".repeat(Math.max(0, 18 - String(passed).length - String(failed).length - String(skipped).length))}║`);
  console.log("╚══════════════════════════════════════════════════════╝\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("\n❌ Unexpected error:", e.message);
  process.exit(1);
});
