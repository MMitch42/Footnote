import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    console.error("STRIPE_PRICE_ID is not set");
    return Response.json({ error: "Checkout not configured" }, { status: 500 });
  }

  try {
    // Get the user's email to pre-fill Stripe checkout
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    const email = user.emailAddresses[0]?.emailAddress;

    const appUrl = process.env.APP_URL ?? "https://footnote-web.vercel.app";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      ...(email ? { customer_email: email } : {}),
      success_url: `${appUrl}/watchlist?upgraded=true`,
      cancel_url: `${appUrl}/upgrade`,
      consent_collection: {
        terms_of_service: "required",
      },
      metadata: { user_id: userId },
      subscription_data: {
        metadata: { user_id: userId },
      },
    });

    return Response.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe checkout error:", message);
    return Response.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
