import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0a",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px 96px",
          fontFamily: "ui-monospace, 'Cascadia Code', monospace",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle grid background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(#1a1a1a 1px, transparent 1px), linear-gradient(90deg, #1a1a1a 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            opacity: 0.4,
            display: "flex",
          }}
        />

        {/* Accent glow */}
        <div
          style={{
            position: "absolute",
            top: -200,
            right: -100,
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Content */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 0 }}>
          {/* Brand */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 0,
              marginBottom: 32,
            }}
          >
            <span
              style={{
                fontSize: 28,
                color: "#f59e0b",
                fontWeight: 800,
                letterSpacing: "-1px",
                fontFamily: "ui-monospace, monospace",
                display: "flex",
              }}
            >
              FN
            </span>
            <span
              style={{
                fontSize: 14,
                color: "#f59e0b",
                fontWeight: 700,
                opacity: 0.7,
                marginBottom: 10,
                marginLeft: 1,
                display: "flex",
              }}
            >
              ¹
            </span>
            <span
              style={{
                fontSize: 14,
                color: "#888",
                letterSpacing: "0.25em",
                fontWeight: 500,
                marginLeft: 12,
                alignSelf: "flex-end",
                marginBottom: 3,
                display: "flex",
              }}
            >
              FOOTNOTE
            </span>
          </div>

          {/* Headline */}
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "#f5f5f5",
              lineHeight: 1.1,
              marginBottom: 24,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Know before</span>
            <span>most investors do.</span>
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 24,
              color: "#888",
              lineHeight: 1.5,
              maxWidth: 680,
              display: "flex",
            }}
          >
            SEC 10-K and 10-Q filing diffs, scored for semantic novelty.
          </div>

          {/* Tags */}
          <div style={{ display: "flex", gap: 12, marginTop: 48 }}>
            {["Risk Factors", "MD&A", "Legal Proceedings"].map((tag) => (
              <div
                key={tag}
                style={{
                  border: "1px solid #2a2a2a",
                  borderRadius: 8,
                  padding: "8px 16px",
                  color: "#555",
                  fontSize: 18,
                  display: "flex",
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        </div>

        {/* Diff preview — decorative */}
        <div
          style={{
            position: "absolute",
            right: 80,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            opacity: 0.7,
          }}
        >
          {[
            { type: "rem", text: "— significant regulatory", score: 8 },
            { type: "add", text: "+ material regulatory uncertainty", score: 8 },
            { type: "neu", text: "  The Company may be subject to", score: null },
            { type: "rem", text: "— oversight from federal agencies", score: 5 },
            { type: "add", text: "+ oversight from multiple federal", score: 5 },
            { type: "add", text: "+ and state agencies, including", score: 5 },
          ].map((line, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontFamily: "ui-monospace, monospace",
                fontSize: 14,
                color:
                  line.type === "rem"
                    ? "#f87171"
                    : line.type === "add"
                    ? "#4ade80"
                    : "#555",
                background:
                  line.type === "rem"
                    ? "rgba(248,113,113,0.08)"
                    : line.type === "add"
                    ? "rgba(74,222,128,0.08)"
                    : "transparent",
                padding: "4px 10px",
                borderRadius: 4,
                width: 340,
              }}
            >
              <span style={{ display: "flex", flex: 1 }}>{line.text}</span>
              {line.score && (
                <span
                  style={{
                    color: line.score >= 7 ? "#f59e0b" : "#555",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "flex",
                  }}
                >
                  {line.score}/10
                </span>
              )}
            </div>
          ))}
        </div>

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 96,
            fontSize: 18,
            color: "#333",
            fontFamily: "ui-monospace, monospace",
            display: "flex",
          }}
        >
          getfootnote.app
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
