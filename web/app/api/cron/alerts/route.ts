import { clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { createServerClient } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);
const API_URL = process.env.NEXT_PUBLIC_API_URL;

type Passage = {
  old: string;
  new: string;
  score: number | null;
  direction: "escalating" | "reassuring" | "neutral" | null;
  explanation: string | null;
  section?: string;
};

type SectionDiff = { changed_passages: Passage[]; change_ratio: number };

type DiffResult = {
  ticker: string;
  filing_type: string;
  date_new: string;
  date_old: string;
  sections: Record<string, SectionDiff>;
  error?: string;
};

// Only Vercel's cron runner (or you, manually) can call this
function authorize(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServerClient();

  // 1. Load all watchlist entries
  const { data: entries, error: wErr } = await sb
    .from("watchlist")
    .select("user_id, ticker, threshold");

  if (wErr || !entries?.length) {
    return Response.json({ ok: true, sent: 0, reason: wErr?.message ?? "empty watchlist" });
  }

  // 2. Fetch diffs for each unique ticker (deduplicated)
  const uniqueTickers = [...new Set(entries.map((e: { ticker: string }) => e.ticker))];
  const diffs: Record<string, DiffResult | null> = {};

  await Promise.allSettled(
    uniqueTickers.map(async (ticker) => {
      try {
        const res = await fetch(`${API_URL}/alert/${ticker}`, { signal: AbortSignal.timeout(30_000) });
        diffs[ticker] = res.ok ? await res.json() : null;
      } catch {
        diffs[ticker] = null;
      }
    })
  );

  // 3. Fan out: check each watchlist entry against the diff
  const clerk = await clerkClient();
  let sent = 0;
  const errors: string[] = [];

  for (const entry of entries as { user_id: string; ticker: string; threshold: number }[]) {
    try {
      const diff = diffs[entry.ticker];
      if (!diff || diff.error) continue;

      // Already alerted for this filing?
      const { data: existing } = await sb
        .from("alerts_log")
        .select("id")
        .eq("user_id", entry.user_id)
        .eq("ticker", entry.ticker)
        .eq("filing_date", diff.date_new)
        .maybeSingle();

      if (existing) continue;

      // Any passages above this user's threshold?
      const triggered = Object.entries(diff.sections).flatMap(([section, sd]) =>
        (sd.changed_passages ?? [])
          .filter((p) => (p.score ?? 0) >= entry.threshold)
          .map((p) => ({ ...p, section }))
      ).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

      if (triggered.length === 0) continue;

      // Get user email from Clerk
      const user = await clerk.users.getUser(entry.user_id);
      const email = user.emailAddresses[0]?.emailAddress;
      if (!email) continue;

      // Send alert
      const appUrl = process.env.APP_URL ?? "https://footnote-web.vercel.app";
      await resend.emails.send({
        // TODO: replace sender once your domain is verified in Resend
        from: "Footnote <onboarding@resend.dev>",
        to: email,
        subject: `${entry.ticker} · ${diff.filing_type}: ${triggered.length} change${triggered.length !== 1 ? "s" : ""} above your threshold`,
        html: buildAlertEmail({ diff, passages: triggered, appUrl }),
      });

      // Log it so we don't re-send
      await sb.from("alerts_log").insert({
        user_id: entry.user_id,
        ticker: entry.ticker,
        filing_date: diff.date_new,
        passages_count: triggered.length,
      });

      sent++;
    } catch (e) {
      errors.push(`${entry.ticker}/${entry.user_id}: ${e}`);
    }
  }

  return Response.json({ ok: true, sent, errors: errors.length ? errors : undefined });
}

/* ── Email HTML ─────────────────────────────────────────────── */
const SCORE_COLOR: Record<string, string> = {
  critical: "#f87171",
  high: "#f59e0b",
  notable: "#d97706",
  low: "#6b7280",
};

function scoreLabel(score: number | null) {
  if (!score) return { label: "—", color: "#6b7280" };
  if (score >= 9) return { label: `${score}/10 Critical`, color: SCORE_COLOR.critical };
  if (score >= 7) return { label: `${score}/10 High`,     color: SCORE_COLOR.high };
  if (score >= 4) return { label: `${score}/10 Notable`,  color: SCORE_COLOR.notable };
  return              { label: `${score}/10 Low`,         color: SCORE_COLOR.low };
}

function buildAlertEmail({
  diff,
  passages,
  appUrl,
}: {
  diff: DiffResult;
  passages: (Passage & { section?: string })[];
  appUrl: string;
}): string {
  const top = passages.slice(0, 5);
  const diffUrl = `${appUrl}/diff/${diff.ticker}`;

  const findingsHtml = top.map((p) => {
    const { label, color } = scoreLabel(p.score);
    const dirIcon =
      p.direction === "escalating" ? "↑" :
      p.direction === "reassuring" ? "↓" : "·";
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #1f1f1f;vertical-align:top;">
          <p style="margin:0 0 4px;font-family:monospace;font-size:12px;font-weight:700;color:${color};">
            ${dirIcon} ${label}
          </p>
          <p style="margin:0;font-size:13px;color:#d1d5db;line-height:1.5;">
            ${p.explanation ?? "Language change detected."}
          </p>
        </td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

        <!-- Logo -->
        <tr><td style="padding-bottom:32px;">
          <p style="margin:0;font-family:monospace;font-size:16px;font-weight:700;color:#f0f0f0;letter-spacing:0.05em;">
            FOOTNOTE
          </p>
          <p style="margin:4px 0 0;font-family:monospace;font-size:11px;color:#4b5563;text-transform:uppercase;letter-spacing:0.1em;">
            SEC Filing Alert
          </p>
        </td></tr>

        <!-- Ticker + filing info -->
        <tr><td style="padding:20px;background:#111111;border:1px solid #1f1f1f;border-radius:8px;margin-bottom:24px;">
          <p style="margin:0 0 2px;font-family:monospace;font-size:22px;font-weight:700;color:#f59e0b;">
            ${diff.ticker}
          </p>
          <p style="margin:0 0 12px;font-family:monospace;font-size:12px;color:#6b7280;">
            ${diff.filing_type} &nbsp;·&nbsp; ${diff.date_old} → ${diff.date_new}
          </p>
          <p style="margin:0;font-size:13px;color:#9ca3af;">
            <strong style="color:#f0f0f0;">${passages.length} change${passages.length !== 1 ? "s" : ""}</strong>
            found above your alert threshold.
          </p>
        </td></tr>

        <tr><td style="height:24px;"></td></tr>

        <!-- Findings -->
        <tr><td>
          <p style="margin:0 0 12px;font-family:monospace;font-size:10px;font-weight:700;color:#4b5563;text-transform:uppercase;letter-spacing:0.1em;">
            Top findings
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${findingsHtml}
          </table>
        </td></tr>

        <tr><td style="height:28px;"></td></tr>

        <!-- CTA -->
        <tr><td>
          <a href="${diffUrl}"
             style="display:inline-block;background:#f59e0b;color:#0a0a0a;padding:11px 22px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:700;font-family:monospace;">
            View full analysis →
          </a>
        </td></tr>

        <tr><td style="height:40px;"></td></tr>

        <!-- Footer -->
        <tr><td style="border-top:1px solid #1f1f1f;padding-top:20px;">
          <p style="margin:0;font-size:11px;color:#374151;line-height:1.6;">
            You're receiving this because <strong style="color:#4b5563;">${diff.ticker}</strong>
            is on your Footnote watchlist.
            Manage your watchlist at
            <a href="${appUrl}/watchlist" style="color:#4b5563;">${appUrl}/watchlist</a>.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
