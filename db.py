import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

_client = None


def get_client():
    global _client
    if _client is None:
        _client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
    return _client


def upsert_filing(ticker: str, filing_type: str, sections: dict):
    """Insert or update a filing's extracted sections."""
    client = get_client()
    row = {
        "ticker": ticker.upper(),
        "filing_type": filing_type,
        "filing_date": sections["filing_date"],
        "accession_number": sections["accession_number"],
        "item_1a": sections.get("item_1a", ""),
        "item_7": sections.get("item_7", ""),
        "item_3": sections.get("item_3", ""),
        "word_count_1a": len(sections.get("item_1a", "").split()),
    }
    return client.table("filings").upsert(row, on_conflict="accession_number").execute()


def upsert_diff(ticker: str, filing_type: str, date_new: str, date_old: str, section: str, result: dict):
    """Store a computed diff so it's never recomputed."""
    client = get_client()
    row = {
        "ticker": ticker.upper(),
        "filing_type": filing_type,
        "filing_date_new": date_new,
        "filing_date_old": date_old,
        "section": section,
        "changed_passages": result["changed_passages"],
        "change_ratio": result["change_ratio"],
    }
    return (
        client.table("diffs")
        .upsert(row, on_conflict="ticker,filing_type,filing_date_new,filing_date_old,section")
        .execute()
    )


def get_diff(ticker: str, filing_type: str, date_new: str, date_old: str, section: str):
    """Return a cached diff if it exists, otherwise None."""
    client = get_client()
    result = (
        client.table("diffs")
        .select("*")
        .eq("ticker", ticker.upper())
        .eq("filing_type", filing_type)
        .eq("filing_date_new", date_new)
        .eq("filing_date_old", date_old)
        .eq("section", section)
        .execute()
    )
    return result.data[0] if result.data else None


def create_job(job_id: str, ticker: str, form: str):
    """Create a pending background job."""
    client = get_client()
    return client.table("jobs").insert({
        "id": job_id,
        "ticker": ticker.upper(),
        "form": form,
        "status": "pending",
    }).execute()


def update_job(job_id: str, status: str, result=None):
    """Update a job's status and store its result."""
    client = get_client()
    return client.table("jobs").update({
        "status": status,
        "result": result,
    }).eq("id", job_id).execute()


def get_job(job_id: str):
    """Fetch a job by ID."""
    client = get_client()
    result = client.table("jobs").select("*").eq("id", job_id).execute()
    return result.data[0] if result.data else None


def get_filing(ticker: str, filing_type: str, filing_date: str):
    """Fetch a stored filing by ticker, type, and date."""
    client = get_client()
    result = (
        client.table("filings")
        .select("*")
        .eq("ticker", ticker.upper())
        .eq("filing_type", filing_type)
        .eq("filing_date", filing_date)
        .execute()
    )
    return result.data[0] if result.data else None


def upsert_synthesis(ticker: str, filing_type: str, date_new: str, date_old: str, synthesis: dict):
    """
    Cache a synthesis report for a filing pair.
    Stored in the diffs table as section='synthesis' to avoid schema changes.
    The synthesis dict is stored in changed_passages (JSONB accepts any JSON).
    """
    client = get_client()
    row = {
        "ticker": ticker.upper(),
        "filing_type": filing_type,
        "filing_date_new": date_new,
        "filing_date_old": date_old,
        "section": "synthesis",
        "changed_passages": synthesis,
        "change_ratio": 0.0,
    }
    return (
        client.table("diffs")
        .upsert(row, on_conflict="ticker,filing_type,filing_date_new,filing_date_old,section")
        .execute()
    )


def get_synthesis(ticker: str, filing_type: str, date_new: str, date_old: str) -> dict | None:
    """Return cached synthesis report, or None if not yet computed."""
    client = get_client()
    result = (
        client.table("diffs")
        .select("changed_passages")
        .eq("ticker", ticker.upper())
        .eq("filing_type", filing_type)
        .eq("filing_date_new", date_new)
        .eq("filing_date_old", date_old)
        .eq("section", "synthesis")
        .execute()
    )
    if result.data:
        data = result.data[0]["changed_passages"]
        # Only return if it's a real result (not an error fallback with no content)
        if isinstance(data, dict) and not data.get("_error"):
            return data
    return None


def get_recent_diffs(limit: int = 48) -> list:
    """Return recent diff rows across all tickers for homepage feed."""
    client = get_client()
    result = (
        client.table("diffs")
        .select("ticker,filing_type,filing_date_new,filing_date_old,changed_passages,computed_at")
        .neq("section", "synthesis")          # exclude synthesis meta-rows
        .order("filing_date_new", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data if result.data else []


def list_diffs_raw(ticker: str, filing_type: str) -> list:
    """Return all cached diff rows for a ticker — used to build the timeline."""
    client = get_client()
    result = (
        client.table("diffs")
        .select("filing_date_new,filing_date_old,section,changed_passages,change_ratio")
        .eq("ticker", ticker.upper())
        .eq("filing_type", filing_type)
        .neq("section", "synthesis")          # exclude synthesis meta-rows
        .execute()
    )
    return result.data if result.data else []


def list_filings_dates(ticker: str, filing_type: str) -> list:
    """Return all cached filing dates for a ticker, newest first."""
    client = get_client()
    result = (
        client.table("filings")
        .select("filing_date,accession_number")
        .eq("ticker", ticker.upper())
        .eq("filing_type", filing_type)
        .order("filing_date", desc=True)
        .execute()
    )
    return result.data if result.data else []
