"""
Two pipeline modes:

  alert_mode(ticker, form)
    — fetches the 2 most recent filings, diffs them, scores changes
    — used by the cron job for watchlist alerts

  historical_mode(ticker, form, n)
    — backfills the last n filings for a ticker
    — used on first user lookup to populate historical data
"""

import edgar as edgar_client
import db
from diff import compute_diff, filter_scorable
from scoring import score_all

SECTIONS = ["item_1a", "item_7", "item_3"]


def alert_mode(ticker: str, form: str = "10-K") -> dict:
    """
    Compare the two most recent filings for a ticker.
    Returns scored diffs for all three sections.
    """
    filings = edgar_client.get_filings(ticker, form=form, n=2)
    if len(filings) < 2:
        return {"error": f"fewer than 2 {form} filings found for {ticker}"}

    new_filing = edgar_client.extract_sections(filings[0])
    old_filing = edgar_client.extract_sections(filings[1])

    db.upsert_filing(ticker, form, new_filing)
    db.upsert_filing(ticker, form, old_filing)

    results = {}
    for section in SECTIONS:
        cached = db.get_diff(ticker, form, new_filing["filing_date"], old_filing["filing_date"], section)
        if cached:
            results[section] = cached
            continue

        diff = compute_diff(old_filing.get(section, ""), new_filing.get(section, ""))
        scorable = filter_scorable(diff["changed_passages"])
        scored = score_all(scorable)
        diff["changed_passages"] = scored

        db.upsert_diff(ticker, form, new_filing["filing_date"], old_filing["filing_date"], section, diff)
        results[section] = diff

    return {
        "ticker": ticker,
        "filing_type": form,
        "date_new": new_filing["filing_date"],
        "date_old": old_filing["filing_date"],
        "sections": results,
    }


def historical_mode(ticker: str, form: str = "10-K", n: int = 10) -> list[dict]:
    """
    Backfill the last n filings for a ticker and compute diffs between each consecutive pair.
    Returns a list of diff results ordered newest-first.
    """
    filings_raw = edgar_client.get_filings(ticker, form=form, n=n)
    filings = [edgar_client.extract_sections(f) for f in filings_raw]

    for f in filings:
        db.upsert_filing(ticker, form, f)

    results = []
    for i in range(len(filings) - 1):
        new_f, old_f = filings[i], filings[i + 1]
        pair_result = {"date_new": new_f["filing_date"], "date_old": old_f["filing_date"], "sections": {}}

        for section in SECTIONS:
            cached = db.get_diff(ticker, form, new_f["filing_date"], old_f["filing_date"], section)
            if cached:
                pair_result["sections"][section] = cached
                continue

            diff = compute_diff(old_f.get(section, ""), new_f.get(section, ""))
            scorable = filter_scorable(diff["changed_passages"])
            scored = score_all(scorable)
            diff["changed_passages"] = scored

            db.upsert_diff(ticker, form, new_f["filing_date"], old_f["filing_date"], section, diff)
            pair_result["sections"][section] = diff

        results.append(pair_result)

    return results
