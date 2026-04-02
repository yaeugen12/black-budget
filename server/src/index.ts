import express from "express";
import cors from "cors";
import multer from "multer";
import { parseInvoice } from "./services/invoice-parser.js";
import { evaluatePolicy } from "./services/rule-engine.js";
import { generateProof } from "./services/proof-generator.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

// ─── Health Check ───────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "0.1.0", name: "Black Budget API" });
});

// ─── Parse Invoice (AI) ─────────────────────────────────────────────
app.post("/api/invoices/parse", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const parsed = await parseInvoice(req.file.buffer, req.file.mimetype);
    const policyDecision = evaluatePolicy(parsed, {
      autoApproveLimit: 5_000_000_000, // 5000 USDC in lamports
      dualApproveThreshold: 15_000_000_000,
      monthlyBurnCap: 75_000_000_000,
      requireVendorVerification: true,
      restrictToKnownRecipients: false,
      minRunwayMonths: 8,
      currentMonthlySpend: 32_000_000_000,
    });

    res.json({ invoice: parsed, policy: policyDecision });
  } catch (error) {
    console.error("Parse error:", error);
    res.status(500).json({ error: "Failed to parse invoice" });
  }
});

// ─── Generate Proof ─────────────────────────────────────────────────
app.post("/api/proofs/generate", async (req, res) => {
  try {
    const { type, periodStart, periodEnd } = req.body;
    const proof = generateProof(type, periodStart, periodEnd);
    res.json(proof);
  } catch (error) {
    console.error("Proof error:", error);
    res.status(500).json({ error: "Failed to generate proof" });
  }
});

// ─── Start Server ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n  ██████  ██       █████   ██████ ██   ██`);
  console.log(`  ██   ██ ██      ██   ██ ██      ██  ██`);
  console.log(`  ██████  ██      ███████ ██      █████`);
  console.log(`  ██   ██ ██      ██   ██ ██      ██  ██`);
  console.log(`  ██████  ███████ ██   ██  ██████ ██   ██`);
  console.log(`\n  Black Budget API — Port ${PORT}`);
  console.log(`  Private Finance OS for Internet Companies\n`);
});
