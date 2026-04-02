import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are an invoice data extraction AI. Extract structured data from invoices with high precision. Always return valid JSON.
Risk flags: "new_vendor" (unknown company), "high_amount" (>10000 USD), "rush_payment" (due <3 days), "missing_details" (unclear fields).
Categories: payroll, vendor, subscription, contractor, reimbursement, other.`;

const MODELS = [
  "claude-sonnet-4-5-20250514",
  "claude-3-5-sonnet-20241022",
  "claude-3-haiku-20240307",
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/png";
    if (file.type === "image/jpeg") mediaType = "image/jpeg";
    else if (file.type === "image/webp") mediaType = "image/webp";

    const client = new Anthropic();

    // Try models in order until one works
    let response: Anthropic.Messages.Message | null = null;
    for (const model of MODELS) {
      try {
        response = await client.messages.create({
          model,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: `Extract invoice data as JSON: { "vendor": "string", "amount": number, "currency": "USD", "dueDate": "YYYY-MM-DD", "category": "payroll|vendor|subscription|contractor|reimbursement|other", "lineItems": [{"description": "string", "amount": number}], "riskFlags": ["string"], "confidence": 0-1 }. Return ONLY the JSON.` },
            ],
          }],
        });
        // Successfully parsed with this model
        break;
      } catch (e: any) {
        if (e.status === 404 || e.message?.includes("not_found")) {
          // Model not available, try next
          continue;
        }
        throw e;
      }
    }

    if (!response) {
      return NextResponse.json({ error: "No AI model available" }, { status: 503 });
    }

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI did not return valid JSON", raw: text }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Policy evaluation
    const amount = parsed.amount || 0;
    let action = "auto_approve";
    let reason = "Under $5,000 auto-approve threshold";
    let requiredApprovers = 0;

    if (parsed.riskFlags?.includes("new_vendor")) {
      action = "require_approval";
      reason = "New vendor requires verification";
      requiredApprovers = 1;
    } else if (amount > 15000) {
      action = "require_dual";
      reason = "Over $15,000 — requires Founder + CFO approval";
      requiredApprovers = 2;
    } else if (amount > 5000) {
      action = "require_approval";
      reason = "Over $5,000 — requires single approval";
      requiredApprovers = 1;
    }

    return NextResponse.json({
      invoice: parsed,
      policy: { action, reason, requiredApprovers },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Invoice parse error:", msg);
    return NextResponse.json({ error: "Failed to parse invoice", detail: msg }, { status: 500 });
  }
}
