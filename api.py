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
