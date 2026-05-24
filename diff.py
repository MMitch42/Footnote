import difflib


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

    total = max(len(old_paras), 1)
    change_ratio = (len(added) + len(removed)) / total

    return {
        "changed_passages": added + removed,
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
