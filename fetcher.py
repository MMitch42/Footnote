import time
from edgar import Company, set_identity
from dotenv import load_dotenv
import os

load_dotenv()
set_identity(f"Mitchell Magid {os.getenv('USER_EMAIL', 'mitchell.magid@gmail.com')}")

RATE_LIMIT_DELAY = 0.11  # SEC enforces 10 req/sec hard limit


def get_filings(ticker: str, form: str = "10-K", n: int = 2):
    """Return the n most recent filings of the given type for a ticker."""
    company = Company(ticker)
    filings = company.get_filings(form=form)
    result = filings.latest(n)
    # edgartools returns a single EntityFiling (not a list) when only one result exists
    if result is None:
        return []
    if not isinstance(result, list):
        return [result]
    return result


def extract_sections(filing) -> dict:
    """
    Extract Item 1A, 7, and 3 text from a filing object.
    Returns a dict with section text and filing metadata.
    """
    time.sleep(RATE_LIMIT_DELAY)
    doc = filing.obj()

    return {
        "filing_date": str(filing.filing_date),
        "accession_number": str(filing.accession_number),
        "item_1a": _to_str(getattr(doc, "risk_factors", None)),
        "item_7": _to_str(getattr(doc, "management_discussion", None)),
        "item_3": _get_item_3(doc),
    }


def _get_item_3(doc) -> str:
    """Item 3 (Legal Proceedings) has no dedicated attribute — find it via items dict."""
    try:
        items = doc.items
        # try common key formats
        for key in ["Item 3", "item_3", "3", "Item 3."]:
            if key in items:
                return _to_str(items[key])
    except Exception:
        pass
    return ""


def _to_str(value) -> str:
    if value is None:
        return ""
    return str(value).strip()
