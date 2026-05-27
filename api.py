import uuid
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pipeline import alert_mode, historical_mode
import db

app = FastAPI(title="Footnote API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your Vercel domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


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
    return result[:limit]


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

    return {
        "ticker": ticker.upper(),
        "filing_type": form,
        "date_new": date_new,
        "date_old": date_old,
        "sections": sections,
    }
