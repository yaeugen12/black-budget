#!/usr/bin/env python3
"""Generate 10 test invoices as PNG images for policy testing."""

from PIL import Image, ImageDraw, ImageFont
import os

FONT_PATH = "/System/Library/Fonts/Helvetica.ttc"
OUT_DIR = os.path.join(os.path.dirname(__file__), "invoices")
os.makedirs(OUT_DIR, exist_ok=True)

# 10 invoices covering all policy paths:
# 1-3: Auto-approve (< $5,000)
# 4-5: Single approval ($5,000 - $15,000)
# 6-7: Dual approval (> $15,000)
# 8: New vendor (triggers review regardless)
# 9: Blocked by monthly cap context
# 10: Edge case — exactly $5,000 boundary

invoices = [
    {
        "file": "01-auto-subscription-900.png",
        "vendor": "Vercel Inc.",
        "number": "INV-2026-0401",
        "date": "2026-04-01",
        "due": "2026-04-15",
        "category": "Subscription",
        "items": [("Pro Plan - 12 months", 900.00)],
        "note": "EXPECTED: Auto-approve (< $5,000)",
    },
    {
        "file": "02-auto-contractor-3200.png",
        "vendor": "Sarah Chen Design",
        "number": "SC-2026-047",
        "date": "2026-03-28",
        "due": "2026-04-10",
        "category": "Contractor",
        "items": [("UI/UX Dashboard Redesign", 2400.00), ("Mobile Responsive Adaptation", 800.00)],
        "note": "EXPECTED: Auto-approve (< $5,000)",
    },
    {
        "file": "03-auto-reimbursement-450.png",
        "vendor": "Alex Thompson",
        "number": "EXP-2026-012",
        "date": "2026-04-01",
        "due": "2026-04-05",
        "category": "Reimbursement",
        "items": [("Conference tickets - ETH Denver", 299.00), ("Travel expenses", 151.00)],
        "note": "EXPECTED: Auto-approve (< $5,000)",
    },
    {
        "file": "04-single-vendor-8500.png",
        "vendor": "AWS Cloud Services",
        "number": "AWS-9928374",
        "date": "2026-03-31",
        "due": "2026-04-30",
        "category": "Vendor",
        "items": [("EC2 Instances (March)", 4200.00), ("RDS Database", 2800.00), ("S3 Storage", 1500.00)],
        "note": "EXPECTED: Single approval ($5K-$15K)",
    },
    {
        "file": "05-single-payroll-12000.png",
        "vendor": "Acme Labs Payroll",
        "number": "PAY-2026-04",
        "date": "2026-04-01",
        "due": "2026-04-01",
        "category": "Payroll",
        "items": [("Engineering team - April", 8000.00), ("Operations team - April", 4000.00)],
        "note": "EXPECTED: Single approval ($5K-$15K)",
    },
    {
        "file": "06-dual-vendor-22000.png",
        "vendor": "Cloudflare Enterprise",
        "number": "CF-ENT-2026-Q2",
        "date": "2026-04-01",
        "due": "2026-05-01",
        "category": "Vendor",
        "items": [("Enterprise Plan Annual", 18000.00), ("Workers Unlimited", 4000.00)],
        "note": "EXPECTED: Dual approval (> $15,000)",
    },
    {
        "file": "07-dual-contractor-35000.png",
        "vendor": "BlockSec Auditors",
        "number": "BSA-2026-0088",
        "date": "2026-03-25",
        "due": "2026-04-25",
        "category": "Contractor",
        "items": [("Smart Contract Audit - Phase 1", 20000.00), ("Formal Verification", 15000.00)],
        "note": "EXPECTED: Dual approval (> $15,000)",
    },
    {
        "file": "08-newvendor-rush-2800.png",
        "vendor": "NovaTech Solutions Ltd",
        "number": "NT-FIRST-001",
        "date": "2026-04-02",
        "due": "2026-04-04",
        "category": "Vendor",
        "items": [("Emergency server migration", 2800.00)],
        "note": "EXPECTED: Requires approval (new vendor + rush payment due in 2 days)",
    },
    {
        "file": "09-large-payroll-65000.png",
        "vendor": "Acme Labs Payroll",
        "number": "PAY-2026-04-FULL",
        "date": "2026-04-01",
        "due": "2026-04-01",
        "category": "Payroll",
        "items": [
            ("Engineering (8 devs)", 40000.00),
            ("Design (3 designers)", 15000.00),
            ("Operations (2 ops)", 10000.00),
        ],
        "note": "EXPECTED: Dual approval (> $15K) — also near $75K monthly cap",
    },
    {
        "file": "10-boundary-exact-5000.png",
        "vendor": "DigitalOcean",
        "number": "DO-2026-APR",
        "date": "2026-04-01",
        "due": "2026-04-30",
        "category": "Subscription",
        "items": [("Managed Kubernetes", 3200.00), ("Managed Database", 1800.00)],
        "note": "EXPECTED: Auto-approve (exactly $5,000 = at threshold boundary)",
    },
]


def draw_invoice(inv):
    W, H = 800, 600
    img = Image.new("RGB", (W, H), "#FFFFFF")
    draw = ImageDraw.Draw(img)

    try:
        title_font = ImageFont.truetype(FONT_PATH, 22, index=1)
        header_font = ImageFont.truetype(FONT_PATH, 14, index=1)
        body_font = ImageFont.truetype(FONT_PATH, 13)
        small_font = ImageFont.truetype(FONT_PATH, 11)
    except Exception:
        title_font = header_font = body_font = small_font = ImageFont.load_default()

    # Header bar
    draw.rectangle([(0, 0), (W, 60)], fill="#1a1a2e")
    draw.text((20, 18), "INVOICE", fill="#FFFFFF", font=title_font)
    draw.text((W - 200, 22), inv["number"], fill="#aaaacc", font=header_font)

    # Vendor + dates
    y = 80
    draw.text((20, y), "From:", fill="#666666", font=small_font)
    draw.text((70, y), inv["vendor"], fill="#000000", font=header_font)
    y += 22
    draw.text((20, y), "Date:", fill="#666666", font=small_font)
    draw.text((70, y), inv["date"], fill="#333333", font=body_font)
    draw.text((400, y), f"Due: {inv['due']}", fill="#333333", font=body_font)
    y += 22
    draw.text((20, y), "Category:", fill="#666666", font=small_font)
    draw.text((90, y), inv["category"], fill="#333333", font=body_font)

    # Separator
    y += 35
    draw.line([(20, y), (W - 20, y)], fill="#dddddd", width=1)
    y += 15

    # Table header
    draw.text((20, y), "Description", fill="#666666", font=header_font)
    draw.text((W - 150, y), "Amount", fill="#666666", font=header_font)
    y += 25
    draw.line([(20, y), (W - 20, y)], fill="#eeeeee", width=1)
    y += 10

    # Line items
    total = 0
    for desc, amt in inv["items"]:
        draw.text((20, y), desc, fill="#000000", font=body_font)
        draw.text((W - 150, y), f"${amt:,.2f}", fill="#000000", font=body_font)
        total += amt
        y += 28

    # Total
    y += 10
    draw.line([(W - 250, y), (W - 20, y)], fill="#1a1a2e", width=2)
    y += 10
    draw.text((W - 250, y), "TOTAL", fill="#1a1a2e", font=header_font)
    draw.text((W - 150, y), f"${total:,.2f}", fill="#1a1a2e", font=title_font)

    # Footer note
    y = H - 50
    draw.rectangle([(0, y - 10), (W, H)], fill="#f5f5fa")
    draw.text((20, y), inv["note"], fill="#888888", font=small_font)

    # Payment terms
    draw.text((20, H - 30), f"Payment terms: Net {(inv['items'][0][1] > 10000) and 30 or 15} days", fill="#999999", font=small_font)

    path = os.path.join(OUT_DIR, inv["file"])
    img.save(path, "PNG")
    print(f"  ✓ {inv['file']:45s} ${total:>10,.2f}  {inv['note'].split('(')[1].rstrip(')') if '(' in inv['note'] else ''}")


print("Generating 10 test invoices:\n")
for inv in invoices:
    draw_invoice(inv)
print(f"\nSaved to: {OUT_DIR}")
