import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const SYSTEM_PROMPT = `You are Footnote AI, a helpful assistant built into Footnote — a tool that analyzes language changes between consecutive SEC 10-K and 10-Q filings.

You help users:
- Understand what specific language changes in filings mean in plain English
- Interpret SEC terminology and disclosure categories (Risk Factors, MD&A, Legal Proceedings)
- Understand why a particular change might be significant or routine
- Learn how to read and analyze SEC filings generally

Be concise and precise. Avoid jargon when simpler language works. Keep responses focused — under 200 words unless a longer explanation is clearly needed.

You are not a financial advisor. You do not recommend buying or selling any security, predict stock prices, or provide investment advice. If a user asks for investment advice, clearly explain that you can help them understand filing language but cannot provide investment recommendations.

SEC filings are public documents published by the U.S. Securities and Exchange Commission.`;

type Message = { role: "user" | "assistant"; content: string };

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

  if (sub?.plan !== "pro") {
    return Response.json({ error: "Pro required" }, { status: 403 });
  }

  let messages: Message[];
  let context: { ticker?: string; filingType?: string; dateOld?: string; dateNew?: string } | undefined;

  try {
    ({ messages, context } = await req.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "No messages provided" }, { status: 400 });
  }

  const contextBlock = context?.ticker
    ? `\n\nThe user is currently viewing ${context.ticker}'s ${context.filingType ?? "10-K"} filing` +
      (context.dateOld && context.dateNew ? ` (${context.dateOld} vs ${context.dateNew})` : "") + "."
    : "";

  try {
    const { text } = await generateText({
      model: google("gemini-2.0-flash"),
      system: SYSTEM_PROMPT + contextBlock,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return Response.json({ content: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Gemini chat error:", message);
    return Response.json({ error: "Failed to get response" }, { status: 500 });
  }
}
