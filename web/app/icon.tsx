import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#0a0a0a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            color: "#f59e0b",
            fontSize: 13,
            fontWeight: 800,
            fontFamily: "ui-monospace, monospace",
            lineHeight: 1,
            letterSpacing: "-1px",
          }}
        >
          FN
        </span>
      </div>
    ),
    { ...size }
  );
}
