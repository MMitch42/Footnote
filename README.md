# Footnote

**Know when a company quietly changes what it tells investors.**

Footnote diffs consecutive SEC 10-K and 10-Q filings at the paragraph level and scores every language change for semantic novelty using Gemini. When risk factor language shifts, MD&A tone changes, or legal disclosures get quietly rewritten, Footnote catches it and emails you.

The signal is real. Cohen, Malloy, and Nguyen showed in [Lazy Prices (2020)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1658471) that year-over-year changes in SEC filing language predict stock returns at roughly 22% annualized. Institutional tools that surface this signal charge $15k/year. Footnote does it for $9/month.

→ **[getfootnote.app](https://getfootnote.app)**

---

## What it does

- **Watch any public company** — add tickers to a watchlist, get emailed the moment a new 10-K or 10-Q drops with language that changed
- **Novelty scoring** — every changed passage gets a 1–10 materiality score and a direction (escalating / reassuring / neutral)
- **AI analysis** — a briefing panel summarizes what changed and why it might matter, per filing
- **Word-level diff** — Pro users see inline red/green highlights on exact word changes, not just paragraph-level deltas
- **AI chat** — ask questions about a filing's changes directly (Pro)
- **10-K and 10-Q** — annual and quarterly filings both tracked (10-Q is Pro)
- **Adjustable thresholds** — set alert sensitivity per ticker (Notable 4+, High 7+, Critical 9+)

---

## Tech stack

| Layer | Tool |
|---|---|
| SEC data | `edgartools` (handles inconsistent EDGAR formatting) |
| Database | Supabase (Postgres) |
| AI scoring | Gemini 2.5 Flash Lite |
| AI synthesis | Gemini (via `synthesis.py`) |
| Frontend | Next.js on Vercel |
| Backend API | FastAPI on Railway |
| Auth | Clerk |
| Email | Resend |
| Payments | Stripe |

---

## Project structure

```
/
├── web/                   Next.js frontend (Vercel)
│   ├── app/
│   │   ├── page.tsx                  Landing page
│   │   ├── diff/[ticker]/            Filing diff viewer (two-panel, mobile-responsive)
│   │   ├── watchlist/                Watchlist management
│   │   ├── account/                  Billing management (Stripe portal)
│   │   ├── upgrade/                  Plans page
│   │   └── api/
│   │       ├── cron/alerts/          Daily alert cron (checks for new filings)
│   │       ├── cron/prefetch/        Periodic cache warm-up for top tickers
│   │       ├── chat/                 AI chat endpoint (Pro)
│   │       ├── score-more/           Background scoring for capped passages
│   │       ├── recompute/            Force re-diff from EDGAR
│   │       ├── verify/               Count-check and smart refresh
│   │       ├── stripe/               Checkout + billing portal + webhook
│   │       ├── watchlist/            Watchlist CRUD
│   │       ├── subscription/         Plan lookup
│   │       └── preferences/          User preferences
│   └── components/
│       ├── FeatureLauncher.tsx       Global menu (top-left)
│       └── ChatWidget.tsx            AI chat overlay (Pro)
│
├── api.py             FastAPI server (Railway)
├── pipeline.py        Orchestrates alert mode; handles scoring caps and dedup
├── fetcher.py         edgartools wrapper: fetch filings, extract sections
├── diff.py            Paragraph-level deterministic diff (difflib)
├── scoring.py         Gemini novelty scoring
├── synthesis.py       Gemini briefing/summary generation
└── db.py              Supabase client and query helpers
```

---

## Running locally

### Python backend

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in keys
uvicorn api:app --reload
```

### Next.js frontend

```bash
cd web
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

### Backend (`.env`)

```
SUPABASE_URL=
SUPABASE_KEY=
GEMINI_API_KEY=
CRON_SECRET=
```

### Frontend (`web/.env.local`)

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_API_URL=                      # Railway backend URL
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
GEMINI_API_KEY=
CRON_SECRET=
```

---

## How the pipeline works

**Alert mode** (cron, daily): checks watchlisted tickers for new filings, diffs the latest against the previous filing of the same type, scores changed passages with Gemini, generates a synthesis briefing, and sends email alerts when novelty crosses the user's threshold. Results are cached in Supabase — subsequent loads are instant.

The pipeline scores up to an initial cap per section on first run, then continues scoring the remainder in the background (`score-more`). The `verify` endpoint lets users manually refresh a diff — it re-diffs from EDGAR, surgically removes stale passages by content fingerprint, and appends any newly detected ones without re-scoring what's already cached.

---

## Sections tracked

1. **Item 1A: Risk Factors** — highest signal, most predictive per Lazy Prices research
2. **Item 7: MD&A** — management narrative; detects shifting confidence
3. **Item 3: Legal Proceedings** — companies minimize new litigation here

---

## Database schema

```sql
CREATE TABLE filings (
  id               SERIAL PRIMARY KEY,
  ticker           TEXT NOT NULL,
  cik              TEXT,
  filing_type      TEXT NOT NULL,
  filing_date      DATE NOT NULL,
  accession_number TEXT UNIQUE,
  item_1a          TEXT,
  item_7           TEXT,
  item_3           TEXT,
  word_count_1a    INT,
  fetched_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE diffs (
  id               SERIAL PRIMARY KEY,
  ticker           TEXT NOT NULL,
  filing_type      TEXT NOT NULL,
  filing_date_new  DATE NOT NULL,
  filing_date_old  DATE NOT NULL,
  section          TEXT NOT NULL,
  changed_passages JSONB,   -- [{old, new, score, direction, explanation}]
  change_ratio     FLOAT,
  computed_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(ticker, filing_type, filing_date_new, filing_date_old, section)
);

CREATE TABLE subscriptions (
  user_id                TEXT PRIMARY KEY,
  plan                   TEXT DEFAULT 'free',
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT
);

CREATE TABLE watchlist (
  user_id   TEXT NOT NULL,
  ticker    TEXT NOT NULL,
  threshold INT DEFAULT 7,
  added_at  TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, ticker)
);

CREATE TABLE user_preferences (
  user_id       TEXT PRIMARY KEY,
  digest_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
