import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 18,
          letterSpacing: -1,
          position: "relative",
        }}
      >
        BB
        <div
          style={{
            position: "absolute",
            left: 4,
            right: 4,
            top: 13,
            height: 4,
            background: "#FAFAFA",
          }}
        />
      </div>
    ),
    size
  );
}
