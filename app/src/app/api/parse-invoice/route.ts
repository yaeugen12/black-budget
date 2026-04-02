import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are an invoice data extraction AI for a corporate finance system.
Extract structured data from invoices with high precision.
Always return valid JSON matching the specified schema.
For risk flags, apply these rules:
- "new_vendor": if the vendor name doesn't appear to be a well-known company
- "high_amount": if total amount exceeds 10,000 USD
- "rush_payment": if due date is within 3 days
- "missing_details": if key fields (vendor, amount, date) are unclear
Classify category: payroll, vendor, subscription, contractor, reimbursement, or other.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    // Determine media type
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/png";
    if (file.type === "image/jpeg" || file.type === "image/jpg") mediaType = "image/jpeg";
    else if (file.type === "image/png") mediaType = "image/png";
    else if (file.type === "image/webp") mediaType = "image/webp";

    const client = new Anthropic();

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `Extract all invoice data. Return ONLY JSON:
{
  "vendor": "string",
  "amount": number,
  "currency": "USD",
  "dueDate": "YYYY-MM-DD",
  "category": "payroll|vendor|subscription|contractor|reimbursement|other",
  "lineItems": [{"description": "string", "amount": number}],
  "riskFlags": ["string array"],
  "confidence": number 0-1
}`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Evaluate policy
    const amount = parsed.amount;
    let policyAction = "auto_approve";
    let policyReason = "Under $5,000 auto-approve threshold";
    let requiredApprovers = 0;

    if (parsed.riskFlags?.includes("new_vendor")) {
      policyAction = "require_approval";
      policyReason = "New vendor requires verification";
      requiredApprovers = 1;
    } else if (amount > 15000) {
      policyAction = "require_dual";
      policyReason = "Over $15,000 — requires Founder + CFO approval";
      requiredApprovers = 2;
    } else if (amount > 5000) {
      policyAction = "require_approval";
      policyReason = "Over $5,000 — requires single approval";
      requiredApprovers = 1;
    }

    return NextResponse.json({
      invoice: parsed,
      policy: {
        action: policyAction,
        reason: policyReason,
        requiredApprovers,
      },
    });
  } catch (error) {
    console.error("Invoice parse error:", error);
    return NextResponse.json(
      { error: "Failed to parse invoice" },
      { status: 500 }
    );
  }
}
