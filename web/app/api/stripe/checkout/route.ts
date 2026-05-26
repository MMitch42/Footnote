import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Get the user's email to pre-fill Stripe checkout
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  const email = user.emailAddresses[0]?.emailAddress;

  const appUrl = process.env.APP_URL ?? "https://footnote-web.vercel.app";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
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
}
