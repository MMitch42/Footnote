/**
 * Prefetch diffs for the top 20 US companies by market cap.
 * Run weekly (Sunday 8am UTC) so popular tickers always load instantly.
 * Also callable manually for initial population — protect with CRON_SECRET.
 */

export const maxDuration = 300; // 5 min — needs to be on Pro plan or higher

const TOP_TICKERS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL",
  "META", "TSLA", "LLY",  "AVGO", "WMT",
  "JPM",  "ORCL", "XOM",  "NFLX", "COST",
  "AMD",  "UNH",  "PG",   "V",    "JNJ",
];

export async function GET(req: Request) {
  // Allow Vercel cron (Authorization: Bearer <CRON_SECRET>) or manual with ?secret=
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

  const results: Record<string, string> = {};

  for (const ticker of TOP_TICKERS) {
    try {
      const res = await fetch(`${apiUrl}/alert/${ticker}?form=10-K`, {
        signal: AbortSignal.timeout(45_000), // 45s per ticker
      });
      results[ticker] = res.ok ? "ok" : `http ${res.status}`;
    } catch (e) {
      results[ticker] = e instanceof Error ? e.message : "error";
    }
    // Small pause — Railway is a single instance, don't hammer it
    await new Promise((r) => setTimeout(r, 500));
  }

  const ok = Object.values(results).filter((v) => v === "ok").length;
  console.log(`[prefetch] ${ok}/${TOP_TICKERS.length} tickers warmed`, results);

  return Response.json({ ok, total: TOP_TICKERS.length, results });
}
