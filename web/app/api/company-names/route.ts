// Returns a { ticker: name } map for a comma-separated list of tickers.
// Uses the same in-memory EDGAR cache as /api/company-search.

type Company = { ticker: string; name: string };

let cache: Company[] | null = null;
let cacheAt = 0;
const TTL = 24 * 60 * 60 * 1000;

async function getCompanies(): Promise<Company[]> {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": "Footnote getfootnote.app mitchell.magid@gmail.com" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`EDGAR returned ${res.status}`);
  const raw: Record<string, { ticker: string; title: string }> = await res.json();
  cache = Object.values(raw).map((c) => ({ ticker: c.ticker.toUpperCase(), name: c.title }));
  cacheAt = Date.now();
  return cache;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("tickers") ?? "";
  const tickers = raw.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (tickers.length === 0) return Response.json({});

  try {
    const companies = await getCompanies();
    const map: Record<string, string> = {};
    for (const ticker of tickers) {
      const match = companies.find((c) => c.ticker === ticker);
      if (match) map[ticker] = match.name;
    }
    return Response.json(map);
  } catch {
    return Response.json({});
  }
}
