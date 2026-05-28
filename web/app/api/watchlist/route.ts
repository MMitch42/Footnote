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

  // Free users: up to 2 tickers. Pro users: unlimited.
  const { data: sub } = await sb
    .from("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();

  const isPro = sub?.plan === "pro" || sub?.plan === "research";

  if (!isPro) {
    const { count } = await sb
      .from("watchlist")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) >= 2) {
      return Response.json(
        { error: "Free plan limited to 2 watched tickers. Upgrade to Pro for unlimited watchlist." },
        { status: 403 }
      );
    }
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
