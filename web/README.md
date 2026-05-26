# Footnote -- web

Next.js frontend for [Footnote](../README.md), deployed on Vercel.

## Setup

```bash
npm install
cp .env.example .env.local  # fill in keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Key routes

| Route | Description |
|---|---|
| `/` | Landing page |
| `/watchlist` | User's monitored tickers (requires sign-in) |
| `/diff/[ticker]` | Filing diff view for a specific ticker |
| `/upgrade` | Subscription page |
| `/sign-in`, `/sign-up` | Clerk auth pages |

## API routes

| Route | Description |
|---|---|
| `POST /api/chat` | AI chat assistant (Pro only, powered by Gemini) |
| `GET /api/company-search?q=` | Autocomplete against SEC EDGAR's full company list |
| `GET /api/subscription` | Returns current user's plan (free/pro) |
| `POST /api/stripe/checkout` | Creates a Stripe checkout session |
| `POST /api/stripe/webhook` | Handles Stripe subscription events |
| `GET /api/watchlist` | Lists user's watchlisted tickers |
| `POST /api/waitlist` | Adds email to waitlist |
| `GET /api/admin/grant-pro` | Owner-only: grants pro access without Stripe |
