"""
Holistic synthesis of all scored passages for a filing diff.

Produces a structured intelligence report: executive summary, concerns,
reassurances, management sentiment, and performance implications.

Called once after all passages are scored; result is cached in Supabase so it
is computed exactly once per filing pair and served instantly thereafter.
"""

import json
import time
import random
from google import genai
from google.genai import types
import os
from dotenv import load_dotenv

load_dotenv()

_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Only send the top N passages by score to keep the prompt tight
MAX_PASSAGES_FOR_SYNTHESIS = 20

SYNTHESIS_PROMPT = """You are producing an intelligence report on year-over-year changes in {ticker}'s {filing_type} filing for a sophisticated investor.

Below are the most significant changed passages, each pre-scored and labeled:

{passages}

Write a structured report. Rules:
- Be specific. Name actual companies, products, regulations, or dollar figures when the text supports it.
- No hedging phrases ("may suggest", "could indicate", "appears to"). State what the evidence shows.
- No stock price predictions and no trade recommendations. Implication fields cover business and operational consequences only.
- Concerns = new risks, escalated risk language, removed reassurances, added specificity to a bad outcome.
- Reassurances = softened risk language, removed risks, added forward confidence, improved trajectory language.
- management_sentiment reflects the overall tone shift across all passages: very_cautious if risks dominate and language hardened, very_confident if risk language softened broadly and forward statements strengthened.
- performance_implications = net business takeaway, 1-2 sentences. What this filing change says about where the business is heading.

Respond with JSON only — no markdown, no code fences:
{{
  "executive_summary": "<2-3 sentences. The overall story: what changed, which direction, why it matters.>",
  "management_sentiment": "<very_cautious|cautious|neutral|confident|very_confident>",
  "concerns": [
    {{
      "topic": "<4-7 word label>",
      "section": "<item_1a|item_7|item_3>",
      "severity": "<high|medium|low>",
      "implication": "<1-2 sentences. Specific business consequence — revenue risk, cost pressure, market share, regulatory exposure, etc.>"
    }}
  ],
  "reassurances": [
    {{
      "topic": "<4-7 word label>",
      "section": "<item_1a|item_7|item_3>",
      "severity": "<high|medium|low>",
      "implication": "<1-2 sentences. Specific positive business consequence.>"
    }}
  ],
  "performance_implications": "<1-2 sentences. Net business trajectory. No trade advice.>"
}}"""


def _format_passages(passages: list[dict]) -> str:
    """Format top passages as a numbered list for the synthesis prompt."""
    # Sort by score descending, take top N
    sorted_p = sorted(passages, key=lambda p: p.get("score") or 0, reverse=True)
    top = sorted_p[:MAX_PASSAGES_FOR_SYNTHESIS]

    lines = []
    for i, p in enumerate(top, 1):
        section = p.get("section", "unknown").upper().replace("_", " ")
        score = p.get("score", "?")
        direction = (p.get("direction") or "neutral").upper()
        explanation = p.get("explanation") or "(no explanation)"
        lines.append(
            f"{i}. [{section}] Score {score}/10 | {direction}\n"
            f"   {explanation}"
        )
    return "\n".join(lines)


def synthesize(
    passages: list[dict],
    ticker: str,
    filing_type: str,
    max_retries: int = 2,
) -> dict:
    """
    Generate a structured synthesis report from scored passages.

    passages: flat list of passage dicts, each with keys:
        old, new, score, direction, explanation, section

    Returns a dict with keys:
        executive_summary, management_sentiment, concerns, reassurances,
        performance_implications
    Returns a minimal fallback dict on persistent failure.
    """
    # Filter to only scored passages — unscored add noise
    scored = [p for p in passages if p.get("score") is not None]
    if not scored:
        return _fallback(ticker, filing_type, "no scored passages available")

    passage_text = _format_passages(scored)
    prompt = SYNTHESIS_PROMPT.format(
        ticker=ticker,
        filing_type=filing_type,
        passages=passage_text,
    )

    last_error: Exception = RuntimeError("no attempts made")
    delays = [1.0, 3.0]

    for attempt in range(max_retries + 1):
        try:
            response = _client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                ),
            )
            result = json.loads(response.text)
            # Ensure required keys exist
            result.setdefault("concerns", [])
            result.setdefault("reassurances", [])
            result.setdefault("management_sentiment", "neutral")
            result.setdefault("executive_summary", "")
            result.setdefault("performance_implications", "")
            print(
                f"  [synthesis] {ticker} {filing_type}: "
                f"{len(result['concerns'])} concerns, "
                f"{len(result['reassurances'])} reassurances, "
                f"sentiment={result['management_sentiment']}",
                flush=True,
            )
            return result
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                wait = delays[attempt] + random.uniform(0, 0.5)
                print(
                    f"  [synthesis] attempt {attempt + 1}/{max_retries + 1} failed, "
                    f"retrying in {wait:.1f}s: {e}",
                    flush=True,
                )
                time.sleep(wait)

    print(f"  [synthesis] failed after {max_retries + 1} attempts: {last_error}", flush=True)
    return _fallback(ticker, filing_type, str(last_error))


def _fallback(ticker: str, filing_type: str, reason: str) -> dict:
    return {
        "executive_summary": "",
        "management_sentiment": "neutral",
        "concerns": [],
        "reassurances": [],
        "performance_implications": "",
        "_error": reason,
    }
