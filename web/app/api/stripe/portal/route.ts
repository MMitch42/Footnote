import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createServerClient();
  const { data } = await sb
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.stripe_customer_id) {
    return Response.json({ error: "No billing record found" }, { status: 404 });
  }

  const appUrl = process.env.APP_URL ?? "https://getfootnote.app";

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${appUrl}/account`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe portal error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
