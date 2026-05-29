import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const BASE_SYSTEM_PROMPT = `You are Footnote AI, an assistant built into Footnote — a tool that analyzes language changes between consecutive SEC 10-K and 10-Q filings.

You help users:
- Answer specific questions about what changed in the filing they are currently viewing
- Identify which passages relate to a particular topic (e.g. "find oncology changes", "what changed about China risk")
- Explain what a specific passage change means in plain English
- Assess why a change might be significant or routine for investors
- Explain SEC terminology and disclosure categories (Risk Factors, MD&A, Legal Proceedings)

When you have access to actual diff data (provided below), answer using that data directly — quote or reference specific passages rather than speaking in generalities. The user can already read the passages themselves; your value is connecting dots, explaining implications, and answering targeted searches across all the changes at once.

Be concise and precise. Avoid jargon when simpler language works. Keep responses under 250 words unless the user explicitly asks for more detail.

You are not a financial advisor. Do not recommend buying or selling any security or predict stock prices. If asked for investment advice, explain that you can help interpret filing language but cannot provide investment recommendations.`;

const SECTION_FULL: Record<string, string> = {
  item_1a: "Risk Factors",
  item_7: "MD&A",
  item_3: "Legal Proceedings",
};

type Passage = {
  old: string;
  new: string;
  score: number | null;
  direction: string | null;
  explanation: string | null;
  section?: string;
};

type SynthesisItem = { topic: string; section: string; severity: string; implication: string };

type DiffContext = {
  ticker?: string;
  companyName?: string;
  filingType?: string;
  dateNew?: string;
  dateOld?: string;
  synthesis?: {
    executive_summary?: string;
    management_sentiment?: string;
    concerns?: SynthesisItem[];
    reassurances?: SynthesisItem[];
    performance_implications?: string;
  } | null;
  topPassages?: Passage[];
};

type Message = { role: "user" | "assistant"; content: string };

function buildDiffContextBlock(ctx: DiffContext): string {
  const lines: string[] = [];

  lines.push("=== CURRENT FILING DIFF ===");
  lines.push(`Company: ${ctx.companyName ?? ctx.ticker ?? "Unknown"} (${ctx.ticker ?? ""})`);
  lines.push(`Filing: ${ctx.filingType ?? "10-K"} | ${ctx.dateOld ?? "?"} → ${ctx.dateNew ?? "?"}`);
  lines.push("");

  const syn = ctx.synthesis;
  if (syn) {
    if (syn.executive_summary) {
      lines.push("SUMMARY:");
      lines.push(syn.executive_summary);
      lines.push("");
    }
    if (syn.management_sentiment) {
      lines.push(`MANAGEMENT SENTIMENT: ${syn.management_sentiment.replace(/_/g, " ").toUpperCase()}`);
      lines.push("");
    }
    if (syn.concerns?.length) {
      lines.push("KEY CONCERNS:");
      syn.concerns.forEach((c, i) => {
        const section = SECTION_FULL[c.section] ?? c.section;
        lines.push(`${i + 1}. [${section}] ${c.topic} (${c.severity})`);
        lines.push(`   → ${c.implication}`);
      });
      lines.push("");
    }
    if (syn.reassurances?.length) {
      lines.push("REASSURANCES:");
      syn.reassurances.forEach((r, i) => {
        const section = SECTION_FULL[r.section] ?? r.section;
        lines.push(`${i + 1}. [${section}] ${r.topic}`);
        lines.push(`   → ${r.implication}`);
      });
      lines.push("");
    }
    if (syn.performance_implications) {
      lines.push("BUSINESS OUTLOOK:");
      lines.push(syn.performance_implications);
      lines.push("");
    }
  }

  const passages = ctx.topPassages ?? [];
  if (passages.length > 0) {
    lines.push(`CHANGED PASSAGES (top ${passages.length} by significance, numbered for reference):`);
    lines.push("");
    passages.forEach((p, i) => {
      const section = SECTION_FULL[p.section ?? ""] ?? p.section ?? "Unknown";
      const score = p.score !== null ? `${p.score}/10` : "unscored";
      const dir = p.direction ?? "neutral";
      lines.push(`[${i + 1}] Score: ${score} | Direction: ${dir} | Section: ${section}`);
      if (p.explanation) lines.push(`    Note: ${p.explanation}`);
      if (p.old) lines.push(`    REMOVED: "${p.old}"`);
      if (p.new) lines.push(`    ADDED: "${p.new}"`);
      lines.push("");
    });
    lines.push("NAVIGATION: When the user asks to find, see, or show a specific passage, append [SHOW:N] at the very end of your response (after all text), where N is the passage number above. Only include [SHOW:N] when the user wants to view a particular change — not for general questions.");
    lines.push("");
  }

  lines.push("=== END DIFF ===");
  return lines.join("\n");
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Pro-only feature
  const sb = createServerClient();
  const { data: sub } = await sb
    .from("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .single();

  if (sub?.plan !== "pro" && sub?.plan !== "research") {
    return Response.json({ error: "Pro required" }, { status: 403 });
  }

  let messages: Message[];
  let context: DiffContext | undefined;

  try {
    ({ messages, context } = await req.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "No messages provided" }, { status: 400 });
  }

  // Build system prompt — rich diff context if available, minimal fallback if not
  let systemPrompt = BASE_SYSTEM_PROMPT;
  if (context?.topPassages?.length || context?.synthesis) {
    systemPrompt += "\n\n" + buildDiffContextBlock(context);
  } else if (context?.ticker) {
    systemPrompt += `\n\nThe user is viewing ${context.companyName ?? context.ticker} (${context.ticker}) ` +
      `${context.filingType ?? "10-K"}` +
      (context.dateOld && context.dateNew ? ` (${context.dateOld} vs ${context.dateNew})` : "") +
      ". The diff data has not loaded yet — let the user know you'll be able to answer specific questions once the analysis finishes loading.";
  }

  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return Response.json({ content: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Gemini chat error:", message);
    return Response.json({ error: "Failed to get response. Please try again." }, { status: 500 });
  }
}
