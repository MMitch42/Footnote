// Owner-only route to grant pro access without going through Stripe.
// Works in dev unconditionally. In production requires ?secret=ADMIN_SECRET.
// Usage: visit /api/admin/grant-pro while signed in (add ?secret=xxx in prod).

import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: Request) {
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev) {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get("secret");
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret || secret !== adminSecret) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Not signed in — sign in first then visit this URL" }, { status: 401 });
  }

  const sb = createServerClient();
  const { error } = await sb.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: "owner_manual",
      stripe_subscription_id: "owner_manual",
      plan: "pro",
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("Grant pro error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.redirect(new URL("/watchlist?upgraded=true", req.url), 302);
}
