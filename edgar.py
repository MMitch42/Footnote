import time
from edgar import Company

RATE_LIMIT_DELAY = 0.11  # SEC enforces 10 req/sec hard limit


def get_filings(ticker: str, form: str = "10-K", n: int = 2):
    """Return the n most recent filings of the given type for a ticker."""
    company = Company(ticker)
    filings = company.get_filings(form=form)
    return filings.latest(n)


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
        "item_7": _to_str(getattr(doc, "management_discussion_and_analysis", None)),
        "item_3": _to_str(getattr(doc, "legal_proceedings", None)),
    }


def _to_str(value) -> str:
    if value is None:
        return ""
    return str(value).strip()
