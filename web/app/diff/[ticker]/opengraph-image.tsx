import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const t = ticker.toUpperCase();

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
        {/* Grid background */}
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

        {/* Orange glow */}
        <div
          style={{
            position: "absolute",
            bottom: -150,
            left: -100,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Content */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            gap: 0,
            width: "100%",
          }}
        >
          {/* Brand */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 0,
              marginBottom: 40,
            }}
          >
            <span
              style={{
                fontSize: 22,
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
                fontSize: 12,
                color: "#f59e0b",
                fontWeight: 700,
                opacity: 0.7,
                marginBottom: 8,
                marginLeft: 1,
                display: "flex",
              }}
            >
              ¹
            </span>
            <span
              style={{
                fontSize: 14,
                color: "#444",
                letterSpacing: "0.25em",
                marginLeft: 10,
                alignSelf: "flex-end",
                marginBottom: 2,
                display: "flex",
              }}
            >
              FOOTNOTE
            </span>
          </div>

          {/* Ticker — big */}
          <div
            style={{
              fontSize: 120,
              fontWeight: 700,
              color: "#f59e0b",
              letterSpacing: "-4px",
              lineHeight: 1,
              marginBottom: 24,
              display: "flex",
            }}
          >
            {t}
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 36,
              color: "#888",
              display: "flex",
              gap: 16,
              alignItems: "center",
            }}
          >
            <span>SEC Filing Diff</span>
            <span style={{ color: "#2a2a2a" }}>·</span>
            <span style={{ color: "#555" }}>Novelty-scored language changes</span>
          </div>

          {/* Divider */}
          <div
            style={{
              width: 80,
              height: 2,
              background: "#f59e0b",
              marginTop: 48,
              opacity: 0.4,
              display: "flex",
            }}
          />

          {/* Sections row */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 32,
            }}
          >
            {[
              { label: "Risk Factors", key: "1A" },
              { label: "MD&A", key: "7" },
              { label: "Legal", key: "3" },
            ].map((s) => (
              <div
                key={s.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid #222",
                  borderRadius: 6,
                  padding: "8px 14px",
                  fontSize: 18,
                  color: "#444",
                }}
              >
                <span style={{ color: "#333", fontSize: 14 }}>Item {s.key}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            right: 96,
            fontSize: 18,
            color: "#2a2a2a",
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
