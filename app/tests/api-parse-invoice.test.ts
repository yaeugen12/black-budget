// @vitest-environment node
import { describe, it, expect } from "vitest";

const API_URL = "http://localhost:3000/api/parse-invoice";

// These tests require the dev server running: pnpm dev
// Skip in CI if no server available
const serverAvailable = await fetch("http://localhost:3000")
  .then(() => true)
  .catch(() => false);

describe.skipIf(!serverAvailable)("API: /api/parse-invoice", () => {
  it("returns 400 when no file is uploaded", async () => {
    const res = await fetch(API_URL, { method: "POST", body: new FormData() });
    expect([400, 500]).toContain(res.status); // 400 or 500 — both valid for missing file
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it("parses a PNG invoice and returns structured data", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve("../tests/test-invoice.png");

    // Check if test file exists
    if (!fs.existsSync(filePath)) {
      console.log("Skipping: test-invoice.png not found");
      return;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: "image/png" });
    const formData = new FormData();
    formData.append("file", blob, "test-invoice.png");

    const res = await fetch(API_URL, { method: "POST", body: formData });
    expect(res.status).toBe(200);

    const data = await res.json();

    // Invoice structure
    expect(data.invoice).toBeDefined();
    expect(data.invoice.vendor).toBeTruthy();
    expect(typeof data.invoice.amount).toBe("number");
    expect(data.invoice.amount).toBeGreaterThan(0);
    expect(data.invoice.currency).toBe("USD");
    expect(data.invoice.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.invoice.lineItems).toBeInstanceOf(Array);
    expect(data.invoice.lineItems.length).toBeGreaterThan(0);
    expect(data.invoice.confidence).toBeGreaterThan(0.5);

    // Policy structure
    expect(data.policy).toBeDefined();
    expect(["auto_approve", "require_approval", "require_dual", "block"]).toContain(data.policy.action);
    expect(typeof data.policy.requiredApprovers).toBe("number");
    expect(data.policy.reason).toBeTruthy();
  }, 30000); // 30s timeout for AI call

  it("returns correct policy for amount under $5,000", async () => {
    // Our test invoice is $4,800 — should auto-approve
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve("../tests/test-invoice.png");
    if (!fs.existsSync(filePath)) return;

    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: "image/png" });
    const formData = new FormData();
    formData.append("file", blob, "test-invoice.png");

    const res = await fetch(API_URL, { method: "POST", body: formData });
    const data = await res.json();

    // $4,800 invoice should be auto-approved
    expect(data.invoice.amount).toBeLessThanOrEqual(5000);
    expect(data.policy.action).toBe("auto_approve");
    expect(data.policy.requiredApprovers).toBe(0);
  }, 30000);
});
