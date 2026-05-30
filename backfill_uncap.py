#!/usr/bin/env python3
"""
backfill_uncap.py
-----------------
One-time script to patch diff rows that were hard-capped at 60 passages BEFORE
the null-stub system was introduced.

Old-style rows look like:
  changed_passages = [60 entries, all with non-null scores]   ← hard stop, nothing after

New-style rows look like:
  changed_passages = [60 scored entries] + [N null-stub entries]  ← rest queued for on-demand scoring

This script finds old-style rows, re-diffs from the stored filing text, keeps
the 60 already-scored passages intact, and appends null stubs for anything beyond
position 60. The on-demand scoring machinery then picks them up naturally the next
time someone opens that diff.

Run from the Footnote repo root:
    python backfill_uncap.py

Dry-run (no writes):
    python backfill_uncap.py --dry-run
"""

import sys
import argparse
import db
from diff import compute_diff, filter_scorable
from pipeline import INITIAL_SCORE_CAP, SECTIONS

DRY_RUN = False


def is_old_style_capped(passages: list) -> bool:
    """
    Returns True if this row looks like a pre-stub hard cap:
      - exactly INITIAL_SCORE_CAP entries
      - every entry has a non-null score (no null stubs present yet)
    """
    if len(passages) != INITIAL_SCORE_CAP:
        return False
    return all(p.get("score") is not None for p in passages)


def backfill(dry_run: bool = False):
    client = db.get_client()

    print("Fetching all diff rows (excluding synthesis)...", flush=True)
    result = (
        client.table("diffs")
        .select("ticker,filing_type,filing_date_new,filing_date_old,section,changed_passages,change_ratio")
        .neq("section", "synthesis")
        .execute()
    )

    all_rows = result.data or []
    print(f"Total non-synthesis diff rows: {len(all_rows)}", flush=True)

    capped = [row for row in all_rows if is_old_style_capped(row.get("changed_passages") or [])]
    print(
        f"Old-style hard-capped rows (exactly {INITIAL_SCORE_CAP} fully-scored, no null stubs): {len(capped)}",
        flush=True,
    )

    if not capped:
        print("Nothing to backfill. All rows are already up-to-date.")
        return

    patched = 0
    skipped_no_filing = 0
    skipped_no_text = 0
    skipped_no_extra = 0

    for row in capped:
        ticker         = row["ticker"]
        filing_type    = row["filing_type"]
        date_new       = row["filing_date_new"]
        date_old       = row["filing_date_old"]
        section        = row["section"]
        scored_60      = row["changed_passages"]
        label          = f"{ticker}/{filing_type}/{section}  {date_old} → {date_new}"

        # ── 1. Look up both filing texts ──────────────────────────────────
        filing_new = db.get_filing(ticker, filing_type, date_new)
        filing_old = db.get_filing(ticker, filing_type, date_old)

        if not filing_new or not filing_old:
            print(f"  SKIP (filing not in DB)  {label}", flush=True)
            skipped_no_filing += 1
            continue

        old_text = (filing_old.get(section) or "").strip()
        new_text = (filing_new.get(section) or "").strip()

        if not old_text or not new_text:
            print(f"  SKIP (section text empty) {label}", flush=True)
            skipped_no_text += 1
            continue

        # ── 2. Re-diff to get the complete scorable passage list ──────────
        full_diff    = compute_diff(old_text, new_text)
        all_scorable = filter_scorable(full_diff["changed_passages"])

        if len(all_scorable) <= INITIAL_SCORE_CAP:
            # Re-diff agrees with the cap — nothing was silently dropped
            print(f"  SKIP (re-diff ≤ cap, {len(all_scorable)} passages)  {label}", flush=True)
            skipped_no_extra += 1
            continue

        remainder  = all_scorable[INITIAL_SCORE_CAP:]
        null_stubs = [
            {
                "old":         p.get("old", ""),
                "new":         p.get("new", ""),
                "score":       None,
                "direction":   None,
                "explanation": None,   # explanation=None signals cap-skipped (not a scoring error)
            }
            for p in remainder
        ]

        # ── 3. Patch: keep scored 60, append stubs for the rest ──────────
        patched_passages = scored_60 + null_stubs
        patched_result   = {
            "changed_passages": patched_passages,
            "change_ratio":     full_diff["change_ratio"],
        }

        print(
            f"  {'DRY ' if dry_run else ''}PATCH  {label}"
            f"  +{len(null_stubs)} stubs  (total {len(patched_passages)})",
            flush=True,
        )

        if not dry_run:
            db.upsert_diff(ticker, filing_type, date_new, date_old, section, patched_result)

        patched += 1

    print(
        f"\n{'[DRY RUN] ' if dry_run else ''}Done.\n"
        f"  Patched:               {patched}\n"
        f"  Skipped (no filing):   {skipped_no_filing}\n"
        f"  Skipped (empty text):  {skipped_no_text}\n"
        f"  Skipped (≤ cap):       {skipped_no_extra}",
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill null stubs for hard-capped diff rows.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing to DB.")
    args = parser.parse_args()
    backfill(dry_run=args.dry_run)
