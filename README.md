# Footnote

Footnote diffs consecutive SEC filings (10-K, 10-Q) and scores every language change for semantic materiality. When a company quietly rewrites its risk factors or shifts the tone in MD&A, Footnote catches it and alerts you.

The signal is real. Cohen, Malloy, and Nguyen showed in [Lazy Prices (2020)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1658471) that year-over-year changes in SEC filing language predict stock returns at roughly 22% annualized. Institutional tools that surface this signal charge $15k/year. Footnote does it for $29/month.

---

## What it does

- Monitors watchlisted tickers for new 10-K and 10-Q filings
- Diffs each new filing against the previous one at the paragraph level
- Scores changed passages 1-10 for semantic novelty using Gemini
- Emails users when high-novelty changes appear
- Lets users explore the full change history for any public company

---

## Tech stack

| Layer | Tool |
|---|---|
| SEC data | `edgartools` |
| Database | Supabase (Postgres) |
| AI scoring | Gemini 2.0 Flash |
| Frontend | Next.js on Vercel |
| Backend API | FastAPI on Railway |
| Auth | Clerk |
| Email | Resend |
| Payments | Stripe |

---

## Project structure

```
/                  root
├── web/           Next.js frontend (Vercel)
├── edgar.py       edgartools wrapper: fetch filings, extract sections
├── db.py          Supabase client and query helpers
├── diff.py        paragraph-level deterministic diff
├── scoring.py     Gemini novelty scoring
├── pipeline.py    orchestrates alert mode and historical backfill
└── api.py         FastAPI server (Railway)
```

---

## Running locally

### Python backend

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in keys
uvicorn api:app --reload
```

### Next.js frontend

```bash
cd web
npm install
cp .env.example .env.local  # fill in keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

### Backend (`.env`)

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
GEMINI_API_KEY=
RESEND_API_KEY=
APP_URL=
```

### Frontend (`web/.env.local`)

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
GEMINI_API_KEY=
APP_URL=
```

---

## How the pipeline works

**Alert mode** runs on a cron schedule. It checks for new filings from watchlisted tickers, diffs the latest against the previous filing of the same type, scores the changes, and sends email alerts when novelty crosses the threshold.

**Historical mode** runs on demand. When a user searches a ticker for the first time, the backend backfills all available filings (10-Ks back to ~2005, last 9 10-Qs), stores them, and enables any pair to be diffed and scored.

Both modes share the same extract, diff, and score functions.

---

## Sections tracked

1. **Item 1A: Risk Factors** -- highest signal, most predictive per the Lazy Prices research
2. **Item 7: MD&A** -- management narrative, detects shifting confidence
3. **Item 3: Legal Proceedings** -- companies tend to minimize new litigation here

---

## License

MIT
