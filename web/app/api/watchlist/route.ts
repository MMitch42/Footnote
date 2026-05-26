import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";

// GET /api/watchlist - list the current user's watched tickers
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from("watchlist")
    .select("ticker, threshold, added_at")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// POST /api/watchlist - add a ticker { ticker, threshold }
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker, threshold = 7 } = await req.json();
  if (!ticker) return Response.json({ error: "ticker required" }, { status: 400 });

  const sb = createServerClient();

  // Gate on pro subscription
  const { data: sub } = await sb
    .from("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();
  if (!sub || sub.plan !== "pro") {
    return Response.json({ error: "Pro subscription required" }, { status: 403 });
  }
  const { data, error } = await sb
    .from("watchlist")
    .upsert(
      { user_id: userId, ticker: ticker.toUpperCase(), threshold },
      { onConflict: "user_id,ticker" }
    )
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
