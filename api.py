import gc
import os
import uuid
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pipeline import alert_mode, historical_mode, INITIAL_SCORE_CAP
from scoring import score_all
from synthesis import synthesize
import fetcher as edgar_client
import db

app = FastAPI(title="Footnote API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your Vercel domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)


TOP_TICKERS = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL",
    "META", "TSLA", "LLY",  "AVGO", "WMT",
    "JPM",  "ORCL", "XOM",  "NFLX", "COST",
    "AMD",  "UNH",  "PG",   "V",    "JNJ",
    "BAC",  "MA",   "ABBV", "KO",   "MRK",
    "CVX",  "CSCO", "CRM",  "ACN",  "TMO",
]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/prefetch")
def prefetch(secret: str = None):
    """
    Pre-warm the diff cache for the top 30 tickers.
    Called by the Vercel cron — processes tickers one at a time so Railway
    never holds more than one pipeline run in memory simultaneously.
    Explicit gc.collect() between tickers keeps RSS stable across the full run.
    """
    cron_secret = os.getenv("CRON_SECRET")
    if cron_secret and secret != cron_secret:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    results: dict[str, str] = {}
    for ticker in TOP_TICKERS:
        try:
            alert_mode(ticker, form="10-K")
            results[ticker] = "ok"
            print(f"  [prefetch] {ticker} warmed", flush=True)
        except Exception as e:
            results[ticker] = str(e)
            print(f"  [prefetch] {ticker} error: {e}", flush=True)
        finally:
            gc.collect()  # free filing text + diff arrays before next ticker

    ok = sum(1 for v in results.values() if v == "ok")
    print(f"[prefetch] done — {ok}/{len(TOP_TICKERS)} ok", flush=True)
    return {"ok": ok, "total": len(TOP_TICKERS), "results": results}


@app.get("/alert/{ticker}")
def alert(ticker: str, form: str = "10-K"):
    """
    Compare the two most recent filings for a ticker.
    Returns scored diffs for item_1a (and item_7, item_3 if cached).
    Fast enough to call synchronously — results are cached in Supabase.
    """
    result = alert_mode(ticker.upper(), form=form)
    return result


@app.post("/historical/{ticker}")
def historical(ticker: str, background_tasks: BackgroundTasks, form: str = "10-K", n: int = 10):
    """
    Kick off a historical backfill for a ticker.
    Returns a job_id immediately — poll /job/{job_id} for status and results.
    """
    job_id = str(uuid.uuid4())
    db.create_job(job_id, ticker.upper(), form)
    background_tasks.add_task(_run_historical, job_id, ticker.upper(), form, n)
    return {"job_id": job_id, "status": "pending"}


@app.get("/job/{job_id}")
def get_job(job_id: str):
    """Poll this endpoint to check if a historical backfill is complete."""
    job = db.get_job(job_id)
    if not job:
        return {"error": "job not found"}
    return job


def _run_historical(job_id: str, ticker: str, form: str, n: int):
    try:
        result = historical_mode(ticker, form=form, n=n)
        db.update_job(job_id, "complete", result)
    except Exception as e:
        db.update_job(job_id, "error", {"error": str(e)})


@app.post("/recompute/{ticker}")
def recompute_diff(ticker: str, date_new: str, date_old: str, form: str = "10-K"):
    """
    Force-recompute a diff that was truncated by old pipeline logic (hard-cut at 60 passages
    with no cap-skipped sentinels).  Deletes the stale cached rows for the specific filing pair
    and re-runs alert_mode so the full passage set is scored and stored.
    Returns the fresh result in the same shape as /alert/{ticker}.
    """
    ticker = ticker.upper()
    print(f"[recompute] {ticker} {form} {date_new} vs {date_old} — purging stale cache", flush=True)
    db.delete_diffs(ticker, form, date_new, date_old)
    result = alert_mode(ticker, form=form)
    return result


@app.get("/recent")
def get_recent(limit: int = 8):
    """
    Recent high-novelty filing pairs across all tickers.
    Used for the homepage live feed.
    """
    rows = db.get_recent_diffs(limit=limit * 6)

    pairs: dict = {}
    for row in rows:
        key = (row["ticker"], row["filing_type"], row["filing_date_new"], row["filing_date_old"])
        if key not in pairs:
            pairs[key] = {
                "ticker": row["ticker"],
                "filing_type": row["filing_type"],
                "date_new": row["filing_date_new"],
                "date_old": row["filing_date_old"],
                "scores": [],
                "directions": [],
                "computed_at": row.get("computed_at", ""),
            }
        for p in (row.get("changed_passages") or []):
            if p.get("score") is not None:
                pairs[key]["scores"].append(p["score"])
            if p.get("direction"):
                pairs[key]["directions"].append(p["direction"])

    result = []
    for pair in pairs.values():
        scores = pair["scores"]
        if not scores:
            continue
        dirs = pair["directions"]
        esc = dirs.count("escalating")
        rea = dirs.count("reassuring")
        result.append({
            "ticker": pair["ticker"],
            "filing_type": pair["filing_type"],
            "date_new": pair["date_new"],
            "date_old": pair["date_old"],
            "max_score": max(scores),
            "n_changes": len(scores),
            "direction": "escalating" if esc > rea else "reassuring" if rea > esc else "neutral",
            "computed_at": pair["computed_at"],
        })

    result.sort(key=lambda x: x["date_new"], reverse=True)
    result = result[:limit]

    # Attach company names — use edgartools Company lookup (no EDGAR doc parsing, fast)
    unique_tickers = list({r["ticker"] for r in result})
    name_map: dict[str, str] = {}
    for t in unique_tickers:
        name_map[t] = edgar_client.get_company_name(t)

    for r in result:
        r["company_name"] = name_map.get(r["ticker"], r["ticker"])

    return result


@app.get("/timeline/{ticker}")
def get_timeline(ticker: str, form: str = "10-K"):
    """
    Return novelty-score summary for all cached consecutive diffs.
    Used to render the historical timeline chart on the frontend.
    """
    rows = db.list_diffs_raw(ticker.upper(), form)

    # Group rows by (date_new, date_old) pair and aggregate scores
    pairs: dict = {}
    for row in rows:
        key = (row["filing_date_new"], row["filing_date_old"])
        if key not in pairs:
            pairs[key] = {
                "date_new": row["filing_date_new"],
                "date_old": row["filing_date_old"],
                "scores": [],
                "n_changes": 0,
                "change_ratio": 0.0,
            }
        passages = row.get("changed_passages") or []
        scores = [p["score"] for p in passages if p.get("score") is not None]
        pairs[key]["scores"].extend(scores)
        pairs[key]["n_changes"] += len(passages)
        pairs[key]["change_ratio"] = max(
            pairs[key]["change_ratio"], row.get("change_ratio") or 0.0
        )

    result = []
    for pair in pairs.values():
        scores = pair["scores"]
        result.append({
            "date_new": pair["date_new"],
            "date_old": pair["date_old"],
            "max_score": max(scores) if scores else 0,
            "avg_score": round(sum(scores) / len(scores), 1) if scores else 0,
            "n_changes": pair["n_changes"],
            "change_ratio": round(pair["change_ratio"], 3),
        })

    # Oldest first for chart display
    result.sort(key=lambda x: x["date_new"])
    return result


@app.get("/diff/{ticker}")
def get_specific_diff(ticker: str, date_new: str, date_old: str, form: str = "10-K"):
    """
    Fetch a specific cached diff pair by exact dates.
    Returns 404-style error if not in cache — trigger /historical first.
    """
    sections = {}
    for section in ["item_1a", "item_7", "item_3"]:
        cached = db.get_diff(ticker.upper(), form, date_new, date_old, section)
        if cached:
            sections[section] = cached

    if not sections:
        return {
            "error": f"No cached diff found for {ticker} ({date_new} vs {date_old}). "
                     "Run historical backfill first."
        }

    synthesis = db.get_synthesis(ticker.upper(), form, date_new, date_old)
    company_name = edgar_client.get_company_name(ticker)

    return {
        "ticker": ticker.upper(),
        "company_name": company_name,
        "filing_type": form,
        "date_new": date_new,
        "date_old": date_old,
        "sections": sections,
        "synthesis": synthesis,
    }


@app.post("/score-more/{ticker}")
def score_more(ticker: str, date_new: str, date_old: str, form: str = "10-K"):
    """
    Score passages that were skipped by the initial INITIAL_SCORE_CAP.
    Cap-skipped passages have score=None AND explanation=None.
    Returns the full updated diff result for all three sections.
    """
    ticker = ticker.upper()
    total_scored = 0
    sections_updated = {}

    for section in ["item_1a", "item_7", "item_3"]:
        cached = db.get_diff(ticker, form, date_new, date_old, section)
        if not cached:
            continue

        passages = cached.get("changed_passages") or []
        cap_indices = [
            i for i, p in enumerate(passages)
            if p.get("score") is None
            and p.get("explanation") is None
            and (p.get("old") or p.get("new"))
        ]

        if not cap_indices:
            sections_updated[section] = cached
            continue

        print(
            f"  [score-more] {ticker}/{section}: scoring {len(cap_indices)} cap-skipped passage(s)",
            flush=True,
        )
        rescored = score_all([passages[i] for i in cap_indices])
        updated = list(passages)
        for i, new_p in zip(cap_indices, rescored):
            updated[i] = new_p

        updated_diff = {**cached, "changed_passages": updated}
        db.upsert_diff(ticker, form, date_new, date_old, section, updated_diff)
        sections_updated[section] = updated_diff
        total_scored += len(cap_indices)

    company_name = edgar_client.get_company_name(ticker)

    # Re-synthesize from the full passage set now that all scoring is complete.
    # This overwrites the partial synthesis that was built from the initial cap.
    # Only runs when passages were actually newly scored — if nothing changed,
    # return the existing cached synthesis as-is.
    if total_scored > 0:
        all_passages = [
            {**p, "section": sec}
            for sec, diff_data in sections_updated.items()
            for p in diff_data.get("changed_passages", [])
        ]
        synthesis = synthesize(all_passages, ticker, form)
        if not synthesis.get("_error"):
            db.upsert_synthesis(ticker, form, date_new, date_old, synthesis)
            print(f"  [score-more] {ticker}: synthesis updated from {len(all_passages)} passages", flush=True)
        else:
            # Fall back to whatever was cached if re-synthesis fails
            synthesis = db.get_synthesis(ticker, form, date_new, date_old)
            print(f"  [score-more] {ticker}: re-synthesis failed, keeping cached: {synthesis.get('_error')}", flush=True)
    else:
        synthesis = db.get_synthesis(ticker, form, date_new, date_old)

    print(f"  [score-more] {ticker}: scored {total_scored} additional passages", flush=True)
    return {
        "ticker": ticker,
        "company_name": company_name,
        "filing_type": form,
        "date_new": date_new,
        "date_old": date_old,
        "sections": sections_updated,
        "synthesis": synthesis,
        "newly_scored": total_scored,
    }
