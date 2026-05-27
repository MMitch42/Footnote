import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Google Fonts v1 API (no modern UA) reliably serves TTF, which Satori supports.
// woff2 is NOT supported by Satori/ImageResponse.
async function loadCursiveFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css?family=Dancing+Script:700"
    ).then((r) => r.text());
    const url = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
    if (!url) return null;
    return fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function AppleIcon() {
  const fontData = await loadCursiveFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "#0a0a0a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            color: "#f59e0b",
            fontSize: 88,
            fontWeight: 700,
            fontFamily: fontData ? "'Dancing Script'" : "serif",
            lineHeight: 1,
          }}
        >
          fn
        </span>
      </div>
    ),
    {
      width: 180,
      height: 180,
      ...(fontData
        ? { fonts: [{ name: "Dancing Script", data: fontData, weight: 700 }] }
        : {}),
    }
  );
}
