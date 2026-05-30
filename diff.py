import difflib


def deduplicate_moves(changed_passages: list[dict], similarity_threshold: float = 0.92) -> list[dict]:
    """
    Remove paragraph pairs that appear as both a pure deletion and a pure addition
    where the text is nearly identical — these are paragraphs that were *moved*
    in the document, not actually changed.

    SequenceMatcher sees a moved paragraph as:
      {"old": "wearables text", "new": ""}   ← delete at old position
      {"old": "",  "new": "wearables text"}  ← insert at new position

    We match every pure-deletion against every pure-addition. If their similarity
    is at or above the threshold we treat both as a positional move and discard
    them — nothing actually changed in the text.

    similarity_threshold=0.92 tolerates minor punctuation/formatting drift while
    still catching genuine moves.  Set lower to be more aggressive.
    """
    additions = [(i, p) for i, p in enumerate(changed_passages) if not p.get("old") and p.get("new")]
    deletions = [(i, p) for i, p in enumerate(changed_passages) if p.get("old") and not p.get("new")]

    to_remove: set[int] = set()

    for del_idx, del_p in deletions:
        if del_idx in to_remove:
            continue
        for add_idx, add_p in additions:
            if add_idx in to_remove:
                continue
            ratio = difflib.SequenceMatcher(None, del_p["old"], add_p["new"]).ratio()
            if ratio >= similarity_threshold:
                to_remove.add(del_idx)
                to_remove.add(add_idx)
                break  # each deletion matches at most one addition

    if not to_remove:
        return changed_passages
    return [p for i, p in enumerate(changed_passages) if i not in to_remove]


def split_paragraphs(text: str, min_words: int = 20) -> list[str]:
    """
    Split on double newlines and drop short paragraphs.
    min_words filters out page headers, section titles, and other noise
    that edgartools includes in extracted text (e.g. 'Apple Inc. | 2024 Form 10-K | 11').
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    return [p for p in paragraphs if len(p.split()) >= min_words]


def compute_diff(old_text: str, new_text: str) -> dict:
    """
    Paragraph-level deterministic diff between two filing sections.
    Returns added, removed, unchanged paragraphs and an overall change ratio.
    """
    old_paras = split_paragraphs(old_text)
    new_paras = split_paragraphs(new_text)

    matcher = difflib.SequenceMatcher(None, old_paras, new_paras, autojunk=False)

    added, removed, unchanged = [], [], []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            unchanged.extend(new_paras[j1:j2])
        elif tag == "insert":
            added.extend({"old": "", "new": p} for p in new_paras[j1:j2])
        elif tag == "delete":
            removed.extend({"old": p, "new": ""} for p in old_paras[i1:i2])
        elif tag == "replace":
            for old, new in zip(old_paras[i1:i2], new_paras[j1:j2]):
                added.append({"old": old, "new": new})
            # handle length mismatch in replace blocks
            if (i2 - i1) < (j2 - j1):
                for p in new_paras[j1 + (i2 - i1):j2]:
                    added.append({"old": "", "new": p})
            elif (i2 - i1) > (j2 - j1):
                for p in old_paras[i1 + (j2 - j1):i2]:
                    removed.append({"old": p, "new": ""})

    raw_changes = added + removed
    deduped = deduplicate_moves(raw_changes)

    total = max(len(old_paras), 1)
    change_ratio = len(deduped) / total

    return {
        "changed_passages": deduped,
        "unchanged_count": len(unchanged),
        "change_ratio": round(change_ratio, 4),
    }


def filter_scorable(changed_passages: list[dict], min_ratio: float = 0.1) -> list[dict]:
    """Only return passages with enough change to warrant Gemini scoring."""
    result = []
    for passage in changed_passages:
        old, new = passage.get("old", ""), passage.get("new", "")
        if not old and new:
            result.append(passage)
            continue
        if not old or not new:
            continue
        ratio = difflib.SequenceMatcher(None, old, new).ratio()
        if (1 - ratio) >= min_ratio:
            result.append(passage)
    return result
