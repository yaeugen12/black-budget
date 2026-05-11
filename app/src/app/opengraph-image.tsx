import { ImageResponse } from "next/og";

export const alt = "Black Budget — Private treasury on Solana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0A0A0A",
          color: "#FAFAFA",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        {/* Top: BB monogram in a slab */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 100,
              height: 100,
              background: "#FAFAFA",
              color: "#0A0A0A",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 56,
              letterSpacing: -2,
              borderRadius: 16,
              fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
              position: "relative",
            }}
          >
            BB
            <div
              style={{
                position: "absolute",
                left: 14,
                right: 14,
                top: 46,
                height: 10,
                background: "#0A0A0A",
              }}
            />
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>
            BLACK BUDGET
          </div>
        </div>

        {/* Middle: headline + redaction bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 80, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            Private treasury,
          </div>
          <div style={{ fontSize: 80, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, display: "flex", alignItems: "center", gap: 18 }}>
            verifiably
            <span style={{ display: "inline-flex", padding: "0 18px", background: "#FAFAFA", color: "#0A0A0A", borderRadius: 8 }}>
              compliant
            </span>
            .
          </div>
        </div>

        {/* Bottom: tagline + URL */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 28, color: "#A0A0A0", maxWidth: 720, lineHeight: 1.3 }}>
            Invoices · payroll · approvals · selective disclosure proofs — on Solana, Token-2022.
          </div>
          <div style={{ fontSize: 24, color: "#6B6B6B", fontFamily: "ui-monospace, SF Mono, Menlo, monospace" }}>
            github.com/yaeugen12/black-budget
          </div>
        </div>
      </div>
    ),
    size
  );
}
