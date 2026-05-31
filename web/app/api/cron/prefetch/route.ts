/**
 * Trigger Railway's /prefetch endpoint, which warms the diff cache for the
 * top 30 tickers one at a time — no concurrent pipeline runs, no OOM.
 * Run weekly (Sunday 8am UTC); also callable manually with ?secret=.
 *
 * Railway's /prefetch now returns 202 immediately and runs in a background
 * thread, so this route just needs to fire the request and confirm the kick-off.
 * maxDuration can stay low — we're not waiting for the work to finish.
 */

export const maxDuration = 30;

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

  try {
    const res = await fetch(
      `${apiUrl}/prefetch?secret=${encodeURIComponent(secret ?? "")}`,
      { signal: AbortSignal.timeout(15_000) }   // just the kick-off handshake
    );
    const body = await res.json().catch(() => ({}));
    // Railway returns 202 immediately; actual work runs in background
    console.log(`[prefetch] kicked off: ${JSON.stringify(body)}`);
    return Response.json(body, { status: res.ok ? 202 : res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error(`[prefetch] failed to reach Railway: ${msg}`);
    return Response.json({ error: msg }, { status: 502 });
  }
}
