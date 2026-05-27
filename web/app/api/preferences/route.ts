import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from("user_preferences")
    .select("digest_opt_in")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) console.error("[preferences GET]", error.message);
  return Response.json({ digest_opt_in: data?.digest_opt_in ?? false });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  console.log("[preferences PATCH] user:", userId);

  const body = await req.json();
  const { digest_opt_in } = body;
  if (typeof digest_opt_in !== "boolean") {
    return Response.json({ error: "digest_opt_in must be a boolean" }, { status: 400 });
  }

  const sb = createServerClient();
  const { error } = await sb
    .from("user_preferences")
    .upsert(
      { user_id: userId, digest_opt_in, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, digest_opt_in });
}
