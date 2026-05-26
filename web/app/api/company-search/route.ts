// Proxies SEC EDGAR's company tickers file and returns fuzzy matches.
// Cached in-memory for 24h so we don't hammer EDGAR on every keystroke.

type Company = { ticker: string; name: string };

let cache: Company[] | null = null;
let cacheAt = 0;
const TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getCompanies(): Promise<Company[]> {
  if (cache && Date.now() - cacheAt < TTL) return cache;

  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: {
      // SEC requires a descriptive User-Agent identifying the app and contact
      "User-Agent": "Footnote getfootnote.app mitchell.magid@gmail.com",
      "Accept-Encoding": "gzip, deflate",
    },
    next: { revalidate: 86400 }, // also hint Next.js cache layer
  });

  if (!res.ok) throw new Error(`EDGAR returned ${res.status}`);

  const raw: Record<string, { ticker: string; title: string }> = await res.json();
  cache = Object.values(raw).map((c) => ({
    ticker: c.ticker.toUpperCase(),
    name: c.title,
  }));
  cacheAt = Date.now();
  return cache;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

  if (q.length < 1) return Response.json([]);

  try {
    const companies = await getCompanies();

    // Prioritise ticker-prefix matches, then name-contains matches
    const tickerPrefix = companies.filter((c) =>
      c.ticker.toLowerCase().startsWith(q)
    );
    const nameContains = companies.filter(
      (c) =>
        !c.ticker.toLowerCase().startsWith(q) &&
        c.name.toLowerCase().includes(q)
    );

    const results = [...tickerPrefix, ...nameContains].slice(0, 8);
    return Response.json(results);
  } catch (err) {
    console.error("Company search error:", err);
    return Response.json([], { status: 500 });
  }
}
