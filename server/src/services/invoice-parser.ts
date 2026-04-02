import Anthropic from "@anthropic-ai/sdk";

export interface ParsedInvoice {
  vendor: string;
  amount: number;
  currency: string;
  dueDate: string;
  category: "payroll" | "vendor" | "subscription" | "contractor" | "reimbursement" | "other";
  lineItems: { description: string; amount: number }[];
  riskFlags: string[];
  confidence: number;
}

const SYSTEM_PROMPT = `You are an invoice data extraction AI for a corporate finance system.
Extract structured data from invoices with high precision.
Always return valid JSON matching the specified schema.
For risk flags, apply these rules:
- "new_vendor": if the vendor name doesn't appear to be a well-known company
- "high_amount": if total amount exceeds 10,000 USD
- "rush_payment": if due date is within 3 days
- "missing_details": if key fields (vendor, amount, date) are unclear
Classify category based on the invoice content:
- payroll: salary, wages, bonuses
- vendor: goods, materials, professional services
- subscription: recurring SaaS, cloud, tools
- contractor: freelance work, development, design
- reimbursement: expense reports, travel
- other: anything else`;

export async function parseInvoice(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ParsedInvoice> {
  const client = new Anthropic();

  const mediaType = mimeType.startsWith("image/")
    ? (mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
    : "image/png"; // Default for PDFs converted to images

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
            source: {
              type: "base64",
              media_type: mediaType,
              data: fileBuffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: `Extract all invoice data and return ONLY a JSON object with this exact schema:
{
  "vendor": "string - company/person name",
  "amount": number - total amount in USD,
  "currency": "USD",
  "dueDate": "YYYY-MM-DD",
  "category": "payroll|vendor|subscription|contractor|reimbursement|other",
  "lineItems": [{"description": "string", "amount": number}],
  "riskFlags": ["string array of applicable flags"],
  "confidence": number between 0 and 1
}
Return ONLY the JSON, no other text.`,
          },
        ],
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to extract JSON from AI response");
  }

  const parsed: ParsedInvoice = JSON.parse(jsonMatch[0]);

  // Validate required fields
  if (!parsed.vendor || !parsed.amount || !parsed.currency) {
    throw new Error("Missing required fields in parsed invoice");
  }

  return parsed;
}
