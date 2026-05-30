import { auth } from "@clerk/nextjs/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let ticker: string, form: string, date_new: string, date_old: string;
  try {
    ({ ticker, form, date_new, date_old } = await req.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!ticker || !date_new || !date_old) {
    return Response.json({ error: "Missing required fields: ticker, date_new, date_old" }, { status: 400 });
  }

  const params = new URLSearchParams({ form: form ?? "10-K", date_new, date_old });
  const url = `${API_URL}/recompute/${encodeURIComponent(ticker.toUpperCase())}?${params}`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(180_000), // full recompute can take longer than score-more
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      return Response.json({ error: data?.detail ?? "Recompute failed" }, { status: upstream.status });
    }
    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recompute] upstream error:", message);
    return Response.json({ error: "Recompute timed out or failed. Please try again." }, { status: 500 });
  }
}
