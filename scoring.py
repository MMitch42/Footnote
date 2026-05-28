import os
import json
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

PROMPT_TEMPLATE = """You are analyzing year-over-year changes in SEC 10-K filing language.

OLD TEXT:
{old}

NEW TEXT:
{new}

Rate the semantic materiality of this change for an investor.

Score 1-10:
1-2 = formatting or boilerplate, no meaningful change
3-4 = minor rewording, same substance
5-6 = moderate change in emphasis or specificity
7-8 = materially new information, or meaningfully softened/escalated language
9-10 = significant new disclosure investors should notice immediately

Also assess direction:
- "escalating" = language became more alarming, specific about a risk, or added a new risk
- "reassuring" = language softened, a risk was removed, or concerns were downplayed
- "neutral" = changed but direction is ambiguous

Respond with JSON only:
{{"score": <int>, "direction": "<escalating|reassuring|neutral>", "explanation": "<10-15 words max. Name the specific thing that changed, not that something changed. Active voice. No hedging. Examples: 'Named AWS custom silicon as direct competitive threat for first time' / 'Removed specific $2.3B settlement figure from litigation disclosure' / 'Added TSMC single-source dependency as new supply chain risk'>"}}"""


def score_passage(old_text: str, new_text: str, max_retries: int = 2) -> dict:
    """
    Score one passage with short retry backoff on transient Gemini errors.
    Delays are kept tight (0.5s, 1.5s) — sequential or parallel scoring means
    long per-passage delays multiply badly across a full filing.
    """
    prompt = PROMPT_TEMPLATE.format(
        old=old_text[:3000] if old_text else "(no prior text — entirely new disclosure)",
        new=new_text[:3000],
    )
    last_error: Exception = RuntimeError("no attempts made")
    delays = [0.5, 1.5]
    for attempt in range(max_retries + 1):
        try:
            response = _client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                ),
            )
            return json.loads(response.text)
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                wait = delays[attempt] + random.uniform(0, 0.5)
                print(
                    f"  [scoring] attempt {attempt + 1}/{max_retries + 1} failed, "
                    f"retrying in {wait:.1f}s: {e}",
                    flush=True,
                )
                time.sleep(wait)
    raise last_error


def score_all(changed_passages: list[dict], max_passages: int = 30) -> list[dict]:
    """
    Score passages in parallel (5 workers) so a 30-passage filing takes ~6s
    instead of ~90s sequential. Results are returned in original order.
    """
    if len(changed_passages) > max_passages:
        print(f"  [scoring] capping at {max_passages} passages (found {len(changed_passages)})")
        changed_passages = changed_passages[:max_passages]

    total = len(changed_passages)
    scored: list[dict | None] = [None] * total

    def _score_one(idx: int, passage: dict) -> tuple[int, dict]:
        try:
            result = score_passage(passage.get("old", ""), passage.get("new", ""))
            return idx, {**passage, **result}
        except Exception as e:
            return idx, {**passage, "score": None, "direction": None, "explanation": f"scoring error: {e}"}

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_score_one, i, p): i for i, p in enumerate(changed_passages)}
        for done_count, future in enumerate(as_completed(futures), 1):
            idx, result = future.result()
            scored[idx] = result
            print(f"  [scoring] {done_count}/{total} done", flush=True)

    return [p for p in scored if p is not None]
