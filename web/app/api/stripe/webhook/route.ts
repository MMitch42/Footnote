import { stripe } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase";
import type Stripe from "stripe";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return Response.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e) {
    return Response.json({ error: `Webhook error: ${e}` }, { status: 400 });
  }

  const sb = createServerClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      if (!userId) break;

      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      const tier = session.metadata?.tier ?? "pro";
      const plan = tier === "research" ? "research" : "pro";

      await sb.from("subscriptions").upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan,
        },
        { onConflict: "user_id" }
      );
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const isActive = sub.status === "active" || sub.status === "trialing";

      let plan = "free";
      if (isActive) {
        const priceId = sub.items.data[0]?.price.id;
        plan = priceId === process.env.STRIPE_RESEARCH_PRICE_ID ? "research" : "pro";
      }

      await sb
        .from("subscriptions")
        .update({ plan, stripe_subscription_id: sub.id })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      await sb
        .from("subscriptions")
        .update({ plan: "free" })
        .eq("stripe_customer_id", customerId);
      break;
    }
  }

  return Response.json({ received: true });
}
