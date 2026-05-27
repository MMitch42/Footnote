import { ImageResponse } from "next/og";

// Apple touch icon — used when "Add to Home Screen" on iOS
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "#0a0a0a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        {/* FN monogram */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 0,
          }}
        >
          <span
            style={{
              color: "#f59e0b",
              fontSize: 88,
              fontWeight: 800,
              fontFamily: "ui-monospace, monospace",
              lineHeight: 1,
              letterSpacing: "-5px",
            }}
          >
            FN
          </span>
          {/* Superscript footnote marker — ties to the brand concept */}
          <span
            style={{
              color: "#f59e0b",
              fontSize: 28,
              fontWeight: 700,
              fontFamily: "ui-monospace, monospace",
              lineHeight: 1,
              opacity: 0.7,
              marginBottom: 28,
              marginLeft: 2,
            }}
          >
            ¹
          </span>
        </div>
        {/* Thin rule — the footnote underline */}
        <div
          style={{
            width: 64,
            height: 2,
            background: "#f59e0b",
            opacity: 0.35,
            marginTop: 8,
          }}
        />
      </div>
    ),
    { width: 180, height: 180 }
  );
}
