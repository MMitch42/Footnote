"""
Two pipeline modes:

  alert_mode(ticker, form)
    — fetches the 2 most recent filings, diffs them, scores changes
    — used by the cron job for watchlist alerts

  historical_mode(ticker, form, n)
    — backfills the last n filings for a ticker
    — used on first user lookup to populate historical data
"""

import fetcher as edgar_client
import db
from diff import compute_diff, filter_scorable
from scoring import score_all

SECTIONS = ["item_1a", "item_7", "item_3"]

# Foreign private issuers file 20-F instead of 10-K (e.g. TME, BABA, NIO).
# Automatically fall back so searches "just work" regardless of form type.
FORM_FALLBACKS: dict[str, list[str]] = {
    "10-K": ["20-F", "40-F"],   # 20-F = most FPIs; 40-F = Canadian (RY, TD, SU, ENB…)
    "20-F": ["10-K", "40-F"],
    "40-F": ["10-K", "20-F"],
    "10-Q": [],  # no structured foreign equivalent (6-K is not diffable)
}


def _should_cache(scored: list[dict]) -> bool:
    """Don't cache if every passage failed scoring — next request will retry."""
    if not scored:
        return True
    return any(p.get("score") is not None for p in scored)


def _fill_missing_scores(section_diff: dict, ticker: str, section: str) -> tuple[dict, bool]:
    """
    Re-score any passages whose score is None (from prior rate-limit failures).
    Returns (updated_diff, was_updated).  No-op if everything is already scored.
    """
    passages = section_diff.get("changed_passages", [])
    null_indices = [
        i for i, p in enumerate(passages)
        if p.get("score") is None and (p.get("old") or p.get("new"))
    ]
    if not null_indices:
        return section_diff, False

    print(
        f"  [pipeline] {ticker}/{section}: re-scoring {len(null_indices)} "
        f"null-score passage(s) from cache",
        flush=True,
    )
    rescored = score_all([passages[i] for i in null_indices])
    updated = list(passages)  # shallow copy so we don't mutate the cached object
    for i, new_p in zip(null_indices, rescored):
        updated[i] = new_p
    return {**section_diff, "changed_passages": updated}, True


def alert_mode(ticker: str, form: str = "10-K", sections: list = None) -> dict:
    """
    Compare the two most recent filings for a ticker.
    Returns scored diffs for all three sections.
    Auto-falls back to 20-F when 10-K isn't found (foreign private issuers).
    """
    actual_form = form
    filings = edgar_client.get_filings(ticker, form=actual_form, n=2)

    if len(filings) < 2:
        for fallback in FORM_FALLBACKS.get(form, []):
            candidate = edgar_client.get_filings(ticker, form=fallback, n=2)
            if len(candidate) >= 2:
                filings = candidate
                actual_form = fallback
                print(f"  [pipeline] {ticker}: no {form} found, using {actual_form}", flush=True)
                break

    if len(filings) < 2:
        return {"error": f"fewer than 2 {form} filings found for {ticker}"}

    new_filing = edgar_client.extract_sections(filings[0])
    old_filing = edgar_client.extract_sections(filings[1])

    db.upsert_filing(ticker, actual_form, new_filing)
    db.upsert_filing(ticker, actual_form, old_filing)

    run_sections = sections or SECTIONS
    results = {}
    for section in run_sections:
        cached = db.get_diff(ticker, actual_form, new_filing["filing_date"], old_filing["filing_date"], section)
        if cached:
            cached, updated = _fill_missing_scores(cached, ticker, section)
            if updated and _should_cache(cached["changed_passages"]):
                db.upsert_diff(ticker, actual_form, new_filing["filing_date"], old_filing["filing_date"], section, cached)
            results[section] = cached
            continue

        diff = compute_diff(old_filing.get(section, ""), new_filing.get(section, ""))
        scorable = filter_scorable(diff["changed_passages"])
        scored = score_all(scorable)
        diff["changed_passages"] = scored

        if _should_cache(scored):
            db.upsert_diff(ticker, actual_form, new_filing["filing_date"], old_filing["filing_date"], section, diff)
        else:
            print(f"  [pipeline] all passages failed scoring for {section}, skipping cache")

        results[section] = diff

    return {
        "ticker": ticker,
        "filing_type": actual_form,
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
                cached, updated = _fill_missing_scores(cached, ticker, section)
                if updated and _should_cache(cached["changed_passages"]):
                    db.upsert_diff(ticker, form, new_f["filing_date"], old_f["filing_date"], section, cached)
                pair_result["sections"][section] = cached
                continue

            diff = compute_diff(old_f.get(section, ""), new_f.get(section, ""))
            scorable = filter_scorable(diff["changed_passages"])
            scored = score_all(scorable)
            diff["changed_passages"] = scored

            if _should_cache(scored):
                db.upsert_diff(ticker, form, new_f["filing_date"], old_f["filing_date"], section, diff)
            else:
                print(f"  [pipeline] all passages failed scoring for {section}, skipping cache")

            pair_result["sections"][section] = diff

        results.append(pair_result)

    return results
