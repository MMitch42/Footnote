import { auth } from "@clerk/nextjs/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let ticker: string, form: string;
  try {
    ({ ticker, form } = await req.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!ticker) {
    return Response.json({ error: "Missing required field: ticker" }, { status: 400 });
  }

  const params = new URLSearchParams({ form: form ?? "10-K" });
  const url = `${API_URL}/verify/${encodeURIComponent(ticker.toUpperCase())}?${params}`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      // Re-diff + possible full recompute — give it the same budget as recompute
      signal: AbortSignal.timeout(180_000),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      return Response.json({ error: data?.detail ?? "Verify failed" }, { status: upstream.status });
    }
    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[verify] upstream error:", message);
    return Response.json({ error: "Verify timed out or failed. Please try again." }, { status: 500 });
  }
}
