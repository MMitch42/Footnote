import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";

// DELETE /api/watchlist/:ticker — remove a ticker from the watchlist
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker } = await params;
  const sb = createServerClient();
  const { error } = await sb
    .from("watchlist")
    .delete()
    .eq("user_id", userId)
    .eq("ticker", ticker.toUpperCase());

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}

// PATCH /api/watchlist/:ticker — update threshold
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker } = await params;
  const { threshold } = await req.json();
  if (threshold === undefined) return Response.json({ error: "threshold required" }, { status: 400 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from("watchlist")
    .update({ threshold })
    .eq("user_id", userId)
    .eq("ticker", ticker.toUpperCase())
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
