import os
import json
import time
import random
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
{{"score": <int>, "direction": "<escalating|reassuring|neutral>", "explanation": "<one sentence>"}}"""


def score_passage(old_text: str, new_text: str, max_retries: int = 4) -> dict:
    prompt = PROMPT_TEMPLATE.format(
        old=old_text[:3000] if old_text else "(no prior text — entirely new disclosure)",
        new=new_text[:3000],
    )
    last_error: Exception = RuntimeError("no attempts made")
    for attempt in range(max_retries):
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
            if attempt < max_retries - 1:
                wait = (2 ** attempt) + random.uniform(0, 1)
                print(
                    f"  [scoring] attempt {attempt + 1}/{max_retries} failed, "
                    f"retrying in {wait:.1f}s: {e}",
                    flush=True,
                )
                time.sleep(wait)
    raise last_error


def score_all(changed_passages: list[dict], max_passages: int = 30) -> list[dict]:
    """Score each passage and attach score/direction/explanation to it."""
    if len(changed_passages) > max_passages:
        print(f"  [scoring] capping at {max_passages} passages (found {len(changed_passages)})")
        changed_passages = changed_passages[:max_passages]

    scored = []
    total = len(changed_passages)
    for i, passage in enumerate(changed_passages, 1):
        print(f"  [scoring] {i}/{total}...", flush=True)
        try:
            result = score_passage(passage.get("old", ""), passage.get("new", ""))
            scored.append({**passage, **result})
        except Exception as e:
            scored.append({**passage, "score": None, "direction": None, "explanation": f"scoring error: {e}"})
    return scored
