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
        {/* F — large, orange */}
        <span
          style={{
            color: "#f59e0b",
            fontSize: 96,
            fontWeight: 700,
            fontFamily: "ui-monospace, monospace",
            lineHeight: 1,
            letterSpacing: "-4px",
          }}
        >
          F
        </span>
        {/* footnote dot — ties to the brand concept */}
        <span
          style={{
            color: "#f59e0b",
            fontSize: 18,
            fontWeight: 700,
            fontFamily: "ui-monospace, monospace",
            letterSpacing: "6px",
            opacity: 0.6,
            marginTop: 2,
          }}
        >
          NOTE
        </span>
      </div>
    ),
    { width: 180, height: 180 }
  );
}
