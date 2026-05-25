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
