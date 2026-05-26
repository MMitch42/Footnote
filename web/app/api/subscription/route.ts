import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ plan: "free" });

  const sb = createServerClient();
  const { data, error } = await sb
    .from("subscriptions")
    .select("plan, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Subscription query error:", error.message);
    return Response.json({ plan: "free", error: error.message });
  }

  return Response.json({
    plan: data?.plan ?? "free",
    userId,
    current_period_end: data?.current_period_end ?? null,
  });
}
