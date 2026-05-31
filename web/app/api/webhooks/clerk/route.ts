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
  const name = firstName ?? "there";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Welcome to Footnote</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f1;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:540px;">

          <!-- Logo bar -->
          <tr>
            <td style="padding-bottom:24px;">
              <span style="font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:700;letter-spacing:0.12em;color:#f59e0b;text-transform:uppercase;">Footnote</span>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;border:1px solid #e8e8e4;overflow:hidden;">

              <!-- Amber accent bar -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:#f59e0b;height:4px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Card body -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding:40px 44px 36px;">

                    <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#111111;letter-spacing:-0.02em;line-height:1.25;">
                      Welcome, ${name}.
                    </h1>
                    <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#555555;">
                      Your account is set up. Here is what Footnote does and how to get the most out of it.
                    </p>

                    <!-- Divider -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
                      <tr><td style="border-top:1px solid #f0f0ec;font-size:0;line-height:0;">&nbsp;</td></tr>
                    </table>

                    <!-- What it does -->
                    <p style="margin:0 0 6px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#aaaaaa;">What Footnote does</p>
                    <p style="margin:0 0 28px;font-size:15px;line-height:1.75;color:#333333;">
                      Every time a public company files a new 10-K or 10-Q, Footnote compares it word-for-word against the previous one. Changed passages are scored 1-10 for how much they actually matter. You find out when language shifts in ways that tend to precede bad news.
                    </p>

                    <!-- Three steps -->
                    <p style="margin:0 0 16px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#aaaaaa;">Get started in 3 steps</p>

                    <!-- Step 1 -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:12px;">
                      <tr>
                        <td width="32" valign="top" style="padding-top:1px;">
                          <span style="display:inline-block;width:22px;height:22px;background:#fff8eb;border:1px solid #fde68a;border-radius:6px;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;color:#d97706;text-align:center;line-height:22px;">1</span>
                        </td>
                        <td style="padding-left:8px;">
                          <p style="margin:0;font-size:14px;font-weight:600;color:#111111;line-height:1.4;">Search any public company</p>
                          <p style="margin:2px 0 0;font-size:13px;color:#777777;line-height:1.5;">Enter a ticker or company name on the homepage. Results load in seconds for major companies.</p>
                        </td>
                      </tr>
                    </table>

                    <!-- Step 2 -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:12px;">
                      <tr>
                        <td width="32" valign="top" style="padding-top:1px;">
                          <span style="display:inline-block;width:22px;height:22px;background:#fff8eb;border:1px solid #fde68a;border-radius:6px;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;color:#d97706;text-align:center;line-height:22px;">2</span>
                        </td>
                        <td style="padding-left:8px;">
                          <p style="margin:0;font-size:14px;font-weight:600;color:#111111;line-height:1.4;">Read the diff</p>
                          <p style="margin:2px 0 0;font-size:13px;color:#777777;line-height:1.5;">See every passage that changed between filings, each scored and labeled escalating or reassuring.</p>
                        </td>
                      </tr>
                    </table>

                    <!-- Step 3 -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:32px;">
                      <tr>
                        <td width="32" valign="top" style="padding-top:1px;">
                          <span style="display:inline-block;width:22px;height:22px;background:#fff8eb;border:1px solid #fde68a;border-radius:6px;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;color:#d97706;text-align:center;line-height:22px;">3</span>
                        </td>
                        <td style="padding-left:8px;">
                          <p style="margin:0;font-size:14px;font-weight:600;color:#111111;line-height:1.4;">Watch the companies you track</p>
                          <p style="margin:2px 0 0;font-size:13px;color:#777777;line-height:1.5;">Add tickers to your watchlist. When they next file, you will get an email before most investors notice anything changed.</p>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="background:#f59e0b;border-radius:8px;">
                          <a href="https://getfootnote.app" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#111111;text-decoration:none;letter-spacing:0.01em;">Search your first ticker</a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 8px 0;">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#999999;">
                You signed up for Footnote. You can manage your account at
                <a href="https://getfootnote.app" style="color:#999999;">getfootnote.app</a>.
              </p>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#bbbbbb;">
                Questions? Reply to this email and Mitchell will get back to you.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
