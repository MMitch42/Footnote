# Footnote — Claude Code Context

## What This Is

Footnote diffs consecutive SEC filings (10-K, 10-Q) and scores language changes for semantic novelty using Gemini. Users add tickers to a watchlist and receive email alerts when a company quietly changes language in a new filing. There is also a historical research mode for exploring how a company's narrative has evolved over time.

The product is grounded in the Cohen/Malloy/Nguyen "Lazy Prices" paper — year-over-year changes in SEC filing language predict stock returns at ~22%/year. Institutional tools charge $15k/year for this signal. Footnote delivers it at $29/month.

## Two Pipeline Modes

**Mode 1 — Alert (core value prop)**
Triggered by cron. Detects new 10-K or 10-Q filings for watchlisted tickers. Compares the new filing to the immediately preceding filing of the same type. Emails users when novelty score exceeds threshold. This is why people pay.

**Mode 2 — Historical exploration**
Triggered by user request. Backfills all available filings for a ticker (10-Ks back to ~2005, last 9 10-Qs). Lets users pick any two filings to diff. Novelty score can be charted over time as a signal timeline. This is the demo and the research tool.

Both modes share the same underlying extract → diff → score functions.

## Tech Stack

| Layer | Tool | Why |
|---|---|---|
| EDGAR data | `edgartools` | Handles inconsistent 10-K formatting without regex |
| Database | Supabase (Postgres) | Free tier, easy Python client |
| AI scoring | Gemini (`gemini-2.0-flash`) | User preference over Anthropic |
| Frontend | Next.js on Vercel | Phase 3 — not built yet |
| Python backend | FastAPI on Railway | Vercel can't run Python; needed for API routes |
| Auth | Clerk | Phase 4 |
| Email | Resend | Phase 4 |
| Payments | Stripe | Phase 4 |

## Database Schema

```sql
CREATE TABLE filings (
  id SERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  cik TEXT,
  filing_type TEXT NOT NULL,       -- '10-K' or '10-Q'
  filing_date DATE NOT NULL,
  accession_number TEXT UNIQUE,
  item_1a TEXT,                    -- Risk Factors
  item_7 TEXT,                     -- MD&A
  item_3 TEXT,                     -- Legal Proceedings
  word_count_1a INT,
  fetched_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE diffs (
  id SERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  filing_type TEXT NOT NULL,
  filing_date_new DATE NOT NULL,
  filing_date_old DATE NOT NULL,
  section TEXT NOT NULL,           -- 'item_1a', 'item_7', 'item_3'
  changed_passages JSONB,          -- [{old, new, score, direction, explanation}]
  change_ratio FLOAT,
  computed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ticker, filing_type, filing_date_new, filing_date_old, section)
);
```

## Section Priority

Build in this order. Don't diff other sections in MVP.

1. **Item 1A — Risk Factors** — highest signal, most predictive per Lazy Prices paper
2. **Item 7 — MD&A** — management narrative, detects shifting confidence
3. **Item 3 — Legal Proceedings** — companies minimize new litigation here

## Novelty Score Schema

Each changed passage gets:
```json
{
  "score": 8,
  "direction": "escalating",
  "explanation": "Added specific dollar figure to litigation disclosure"
}
```

`direction` must be one of: `escalating | reassuring | neutral`

Score 1–10: semantic materiality, not text volume. Two sentences swapping "significant" for "material" = low score. One deleted sentence removing a specific settlement figure = high score.

Only score passages where `change_ratio > 0.1` to avoid wasting Gemini calls on cosmetic changes.

## Diffing Approach

Split text on double newlines (`\n\n`) for paragraph-level diff — not sentences. Sentence splitting on `". "` breaks on abbreviations ("U.S.", "approx.", "vs.").

```python
paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
```

Use `difflib.SequenceMatcher` or `difflib.ndiff` on paragraph lists.

## EDGAR Rate Limiting

SEC enforces 10 requests/second. Always add `time.sleep(0.11)` between EDGAR requests. Failure to do this causes 429s that look like parsing errors.

## Key Architectural Decisions

- **No regex for section extraction** — use `edgartools` which handles format variations
- **Lazy diff computation** — compute and cache diffs in the `diffs` table on first request, never recompute
- **Mode 1 fetches 2 filings** — latest + previous only
- **Mode 2 backfills on demand** — when user searches a ticker for the first time, backfill all available filings, then allow any pair to be diffed
- **Job queue for on-demand processing** — user request writes to a `jobs` table, Railway worker picks it up, frontend polls for completion

## What NOT to Build in MVP

- Cross-company comparison
- Sector-level screening ("all S&P 500 companies with high-novelty changes")
- Financial statement diffing (Item 1, Item 2, balance sheet numbers)
- Multi-year trend chart (Phase 2 feature)
- Power tier ($99/mo) — just Free and Pro for now

## File Structure

```
edgar.py       — edgartools wrapper: fetch filings, extract sections
db.py          — Supabase client, insert/query helpers
diff.py        — paragraph-level deterministic diff
scoring.py     — Gemini novelty scoring
pipeline.py    — orchestrates alert mode and historical mode
```
