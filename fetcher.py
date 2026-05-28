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
    if result is None:
        return []
    # edgartools returns a single EntityFiling (no len) when only one result exists,
    # and an EntityFilings collection (has len, supports indexing) for multiple results.
    try:
        count = len(result)
        return [result[i] for i in range(count)]
    except TypeError:
        # Single EntityFiling object
        return [result]


def extract_sections(filing) -> dict:
    """
    Extract Item 1A, 7, and 3 text from a filing object.
    Returns a dict with section text and filing metadata.

    Form-specific notes:
    - 10-K / 20-F: sections are embedded inline → use standard attributes.
    - 40-F (Canadian MJDS filers): substantive content lives in attached exhibits.
        risk_factors  → stub pointer; use aif_text (Annual Information Form, ~150K chars).
        management_discussion → empty; use mda_text if attached, else blank.
        legal_proceedings → works directly.
    """
    time.sleep(RATE_LIMIT_DELAY)
    doc = filing.obj()

    if type(doc).__name__ == "FortyF":
        return {
            "filing_date": str(filing.filing_date),
            "accession_number": str(filing.accession_number),
            # AIF contains the full annual narrative including risk factors
            "item_1a": _to_str(getattr(doc, "aif_text", None)),
            # MD&A may be filed as a separate exhibit; empty if not present
            "item_7": _to_str(getattr(doc, "mda_text", None)),
            "item_3": _to_str(getattr(doc, "legal_proceedings", None)),
        }

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
