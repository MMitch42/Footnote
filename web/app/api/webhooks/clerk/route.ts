/**
 * Clerk webhook receiver.
 * Handles user lifecycle events — currently: user.created (welcome email).
 *
 * Setup:
 *  1. Add CLERK_WEBHOOK_SECRET to Vercel env vars (from Clerk dashboard → Webhooks).
 *  2. In Clerk dashboard, create a webhook pointing to:
 *       https://getfootnote.app/api/webhooks/clerk
 *     and subscribe to the `user.created` event.
 */

import { Webhook } from "svix";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET not set");
    return Response.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  // Verify the webhook signature using svix
  const svixId        = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();

  let event: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(secret);
    event = wh.verify(body, {
      "svix-id":        svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch (err) {
    console.error("[clerk-webhook] signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "user.created") {
    const emailAddresses = event.data.email_addresses as Array<{ email_address: string; id: string }> | undefined;
    const primaryId     = event.data.primary_email_address_id as string | undefined;

    const email = emailAddresses?.find((e) => e.id === primaryId)?.email_address
      ?? emailAddresses?.[0]?.email_address;

    const firstName = (event.data.first_name as string | undefined) ?? null;

    if (email) {
      try {
        await resend.emails.send({
          from: "Mitchell at Footnote <mitchell@getfootnote.app>",
          to:   email,
          subject: "Welcome to Footnote",
          html: buildWelcomeEmail(firstName),
        });
        console.log(`[clerk-webhook] welcome email sent to ${email}`);
      } catch (err) {
        // Don't fail the webhook — Clerk will retry otherwise
        console.error("[clerk-webhook] failed to send welcome email:", err);
      }
    }
  }

  return Response.json({ received: true });
}

function buildWelcomeEmail(firstName: string | null): string {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body  { background: #0d0d0d; color: #e5e5e5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; }
    .wrap { max-width: 520px; margin: 0 auto; padding: 48px 24px; }
    .logo { font-family: 'Courier New', monospace; font-size: 14px; font-weight: 700; letter-spacing: 0.05em; color: #f59e0b; margin-bottom: 32px; }
    h1    { font-size: 22px; font-weight: 600; color: #f5f5f5; margin: 0 0 16px; }
    p     { font-size: 15px; line-height: 1.65; color: #a3a3a3; margin: 0 0 16px; }
    .cta  { display: inline-block; margin-top: 8px; padding: 11px 22px; background: #f59e0b; color: #0d0d0d; font-weight: 700; font-size: 14px; border-radius: 8px; text-decoration: none; }
    .divider { border: none; border-top: 1px solid #262626; margin: 32px 0; }
    .small { font-size: 13px; color: #525252; line-height: 1.6; }
    .mono  { font-family: 'Courier New', monospace; font-size: 13px; background: #1a1a1a; border: 1px solid #262626; border-radius: 4px; padding: 12px 16px; color: #a3a3a3; line-height: 1.7; }
    .label { font-size: 10px; font-family: 'Courier New', monospace; text-transform: uppercase; letter-spacing: 0.08em; color: #737373; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">FOOTNOTE</div>

    <h1>You're in.</h1>

    <p>${greeting}</p>

    <p>
      Thanks for signing up. Footnote tracks SEC filings and alerts you when companies
      quietly rewrite their risk factors, MD&amp;A, or legal disclosures — the language
      shifts that tend to matter before most investors notice.
    </p>

    <div class="label">Quick start</div>
    <div class="mono">
      1. Enter any ticker on the homepage.<br />
      2. See every changed passage from the latest filing, scored for significance.<br />
      3. Add tickers to your watchlist — get emailed the moment they file.
    </div>

    <br />

    <a href="https://getfootnote.app" class="cta">Search your first ticker →</a>

    <hr class="divider" />

    <p class="small">
      You're on the <strong style="color:#e5e5e5">free plan</strong>.
      Upgrade to Pro for email alerts, full AI intelligence reports, 10-Q diffs, and unlimited watchlist.
    </p>

    <p class="small">
      Questions? Just reply to this email.<br />
      — Mitchell
    </p>
  </div>
</body>
</html>
  `.trim();
}
