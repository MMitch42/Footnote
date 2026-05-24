import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

_model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    generation_config={"response_mime_type": "application/json"},
)

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


def score_passage(old_text: str, new_text: str) -> dict:
    prompt = PROMPT_TEMPLATE.format(
        old=old_text[:3000] if old_text else "(no prior text — entirely new disclosure)",
        new=new_text[:3000],
    )
    response = _model.generate_content(prompt)
    return json.loads(response.text)


def score_all(changed_passages: list[dict]) -> list[dict]:
    """Score each passage and attach score/direction/explanation to it."""
    scored = []
    for passage in changed_passages:
        try:
            result = score_passage(passage.get("old", ""), passage.get("new", ""))
            scored.append({**passage, **result})
        except Exception as e:
            scored.append({**passage, "score": None, "direction": None, "explanation": f"scoring error: {e}"})
    return scored
