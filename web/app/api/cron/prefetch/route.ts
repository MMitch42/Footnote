/**
 * Trigger Railway's /prefetch endpoint, which warms the diff cache for the
 * top 30 tickers one at a time — no concurrent pipeline runs, no OOM.
 * Run weekly (Sunday 8am UTC); also callable manually with ?secret=.
 */

export const maxDuration = 300; // 5 min — needs Pro plan or higher

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;

  const validCron = secret && authHeader === `Bearer ${secret}`;
  const validManual = secret && url.searchParams.get("secret") === secret;

  if (secret && !validCron && !validManual) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return Response.json({ error: "NEXT_PUBLIC_API_URL not set" }, { status: 500 });
  }

  // Railway runs the full loop internally — one ticker at a time, GC between each.
  // We give it 4 min 40s; even if Vercel times out, Railway keeps going and
  // populates the cache for the remaining tickers.
  try {
    const res = await fetch(
      `${apiUrl}/prefetch?secret=${encodeURIComponent(secret ?? "")}`,
      { signal: AbortSignal.timeout(280_000) }
    );
    const body = await res.json().catch(() => ({}));
    return Response.json(body, { status: res.ok ? 200 : res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    // TimeoutError just means Vercel's window closed — Railway is still running.
    console.log(`[prefetch] fetch ended: ${msg}`);
    return Response.json({ note: msg }, { status: 202 });
  }
}
