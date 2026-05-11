import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0A0A0A",
          color: "#FAFAFA",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
          fontWeight: 800,
          fontSize: 96,
          letterSpacing: -3,
          position: "relative",
        }}
      >
        BB
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            top: 78,
            height: 20,
            background: "#FAFAFA",
          }}
        />
      </div>
    ),
    size
  );
}
