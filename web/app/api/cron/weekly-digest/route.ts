import { clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { createServerClient } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.APP_URL ?? "https://getfootnote.app";

type Passage = {
  score: number | null;
  direction: "escalating" | "reassuring" | "neutral" | null;
  explanation: string | null;
};

type DiffRow = {
  ticker: string;
  filing_type: string;
  filing_date_new: string;
  filing_date_old: string;
  changed_passages: Passage[] | null;
};

type SynthesisItem = { headline: string; detail?: string };

type Synthesis = {
  executive_summary?: string;
  concerns?: SynthesisItem[];
  reassurances?: SynthesisItem[];
};

type SynthesisRow = {
  ticker: string;
  filing_date_new: string;
  filing_date_old: string;
  changed_passages: Synthesis | null;
};

type TickerSummary = {
  ticker: string;
  filing_type: string;
  date_new: string;
  date_old: string;
  maxScore: number;
  nChanges: number;
  highCount: number;
  direction: "escalating" | "reassuring" | "neutral";
  topExplanation: string | null;
  synthesis?: Synthesis | null;
};

function authorize(req: Request): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: Request) {
  const startMs = Date.now();
  console.log("[weekly-digest] cron triggered");

  if (!authorize(req)) {
    console.warn("[weekly-digest] unauthorized request");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServerClient();

  // 1. Get all watchlist entries
  const { data: watchEntries, error: wErr } = await sb
    .from("watchlist")
    .select("user_id, ticker");

  if (wErr || !watchEntries?.length) {
    console.log("[weekly-digest] exit early:", wErr?.message ?? "empty watchlist");
    return Response.json({ ok: true, sent: 0, reason: wErr?.message ?? "empty watchlist" });
  }
  console.log(`[weekly-digest] ${watchEntries.length} watchlist entries loaded`);

  // 2. Only send to Pro/Research users who have opted in to the digest
  const [{ data: subs }, { data: prefs }] = await Promise.all([
    sb.from("subscriptions").select("user_id, plan").in("plan", ["pro", "research"]),
    sb.from("user_preferences").select("user_id").eq("digest_opt_in", true),
  ]);

  const proUserIds = new Set((subs ?? []).map((s: { user_id: string }) => s.user_id));
  const optInUserIds = new Set((prefs ?? []).map((p: { user_id: string }) => p.user_id));
  console.log(`[weekly-digest] ${proUserIds.size} pro users, ${optInUserIds.size} opted in`);

  // 3. Group watchlist by user (Pro users who opted in only)
  const watchlistByUser: Record<string, string[]> = {};
  for (const entry of watchEntries as { user_id: string; ticker: string }[]) {
    if (!proUserIds.has(entry.user_id)) continue;
    if (!optInUserIds.has(entry.user_id)) continue;
    if (!watchlistByUser[entry.user_id]) watchlistByUser[entry.user_id] = [];
    watchlistByUser[entry.user_id].push(entry.ticker);
  }

  if (!Object.keys(watchlistByUser).length) {
    return Response.json({ ok: true, sent: 0, reason: "no pro users with watchlists" });
  }

  // 4. Fetch recent diffs for all watched tickers (past 7 days — weekly digest)
  const uniqueTickers = [...new Set(Object.values(watchlistByUser).flat())];
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [{ data: recentDiffs }, { data: synthesisDiffs }] = await Promise.all([
    sb
      .from("diffs")
      .select("ticker, filing_type, filing_date_new, filing_date_old, changed_passages")
      .in("ticker", uniqueTickers)
      .gte("filing_date_new", cutoff)
      .neq("section", "synthesis")
      .order("filing_date_new", { ascending: false }),
    sb
      .from("diffs")
      .select("ticker, filing_date_new, filing_date_old, changed_passages")
      .in("ticker", uniqueTickers)
      .gte("filing_date_new", cutoff)
      .eq("section", "synthesis"),
  ]);

  if (!recentDiffs?.length) {
    return Response.json({ ok: true, sent: 0, reason: "no recent diffs in past 7 days" });
  }

  // Build synthesis lookup: "TICKER||date_new||date_old" → synthesis object
  const synthesisMap: Record<string, Synthesis> = {};
  for (const row of (synthesisDiffs ?? []) as SynthesisRow[]) {
    if (row.changed_passages && !("_error" in row.changed_passages)) {
      const key = `${row.ticker}||${row.filing_date_new}||${row.filing_date_old}`;
      synthesisMap[key] = row.changed_passages;
    }
  }

  // 5. Aggregate diffs into per-ticker summaries
  const summaryMap: Record<string, TickerSummary> = {};
  for (const row of recentDiffs as DiffRow[]) {
    const key = `${row.ticker}||${row.filing_date_new}||${row.filing_date_old}`;
    const passages = row.changed_passages ?? [];
    const scores = passages.map((p) => p.score ?? 0);
    const maxScore = scores.length ? Math.max(...scores) : 0;
    const highCount = passages.filter((p) => (p.score ?? 0) >= 7).length;
    const esc = passages.filter((p) => p.direction === "escalating").length;
    const rea = passages.filter((p) => p.direction === "reassuring").length;
    const direction: "escalating" | "reassuring" | "neutral" =
      esc > rea ? "escalating" : rea > esc ? "reassuring" : "neutral";
    const topPassage = [...passages].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

    if (!summaryMap[key]) {
      summaryMap[key] = {
        ticker: row.ticker,
        filing_type: row.filing_type,
        date_new: row.filing_date_new,
        date_old: row.filing_date_old,
        maxScore,
        nChanges: passages.length,
        highCount,
        direction,
        topExplanation: topPassage?.explanation ?? null,
        synthesis: synthesisMap[key] ?? null,
      };
    } else {
      // Merge sections
      summaryMap[key].maxScore = Math.max(summaryMap[key].maxScore, maxScore);
      summaryMap[key].nChanges += passages.length;
      summaryMap[key].highCount += highCount;
      if (esc > rea) summaryMap[key].direction = "escalating";
      else if (rea > esc && summaryMap[key].direction !== "escalating") summaryMap[key].direction = "reassuring";
    }
  }

  const allSummaries = Object.values(summaryMap);

  // 6. Fan out — send one digest per Pro user
  const clerk = await clerkClient();
  let sent = 0;
  const errors: string[] = [];

  for (const [userId, tickers] of Object.entries(watchlistByUser)) {
    try {
      const userSummaries = allSummaries
        .filter((s) => tickers.includes(s.ticker))
        .sort((a, b) => b.maxScore - a.maxScore);

      if (!userSummaries.length) continue;

      const user = await clerk.users.getUser(userId);
      const email = user.emailAddresses[0]?.emailAddress;
      if (!email) continue;

      const highCount = userSummaries.reduce((sum, s) => sum + s.highCount, 0);
      const subject = highCount > 0
        ? `${highCount} high-novelty change${highCount !== 1 ? "s" : ""} across your watchlist this week`
        : `${userSummaries.length} ticker${userSummaries.length !== 1 ? "s" : ""} had filing activity this week`;

      await resend.emails.send({
        from: "Footnote <onboarding@resend.dev>",
        to: email,
        subject,
        html: buildDigestEmail({ summaries: userSummaries }),
      });

      sent++;
    } catch (e) {
      errors.push(`${userId}: ${e}`);
    }
  }

  return Response.json({ ok: true, sent, errors: errors.length ? errors : undefined });
}

/* ── Email HTML ─────────────────────────────────────────────── */
function scoreColor(score: number): string {
  if (score >= 9) return "#f87171";
  if (score >= 7) return "#f59e0b";
  if (score >= 4) return "#d97706";
  return "#6b7280";
}

function scoreLabel(score: number): string {
  if (score >= 9) return "Critical";
  if (score >= 7) return "High";
  if (score >= 4) return "Notable";
  return "Low";
}

function buildDigestEmail({ summaries }: { summaries: TickerSummary[] }): string {
  const tickerRows = summaries.map((s) => {
    const color = scoreColor(s.maxScore);
    const label = scoreLabel(s.maxScore);
    const dirIcon =
      s.direction === "escalating" ? "↑" :
      s.direction === "reassuring"  ? "↓" : "·";
    const dirColor =
      s.direction === "escalating" ? "#f87171" :
      s.direction === "reassuring"  ? "#34d399" : "#6b7280";
    const diffUrl = `${APP_URL}/diff/${s.ticker}`;
    const syn = s.synthesis;

    // Synthesis block: executive summary + top 2 concerns + top 2 reassurances
    const synthesisBlock = syn ? (() => {
      const summary = syn.executive_summary
        ? `<p style="margin:8px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">${syn.executive_summary}</p>`
        : "";
      const concerns = (syn.concerns?.length ?? 0) > 0
        ? syn.concerns!.slice(0, 2).map((c) =>
            `<p style="margin:4px 0 0;font-size:12px;color:#d1d5db;line-height:1.4;"><span style="color:#f87171;">↑</span> ${c.headline}</p>`
          ).join("")
        : "";
      const reassurances = (syn.reassurances?.length ?? 0) > 0
        ? syn.reassurances!.slice(0, 2).map((r) =>
            `<p style="margin:4px 0 0;font-size:12px;color:#d1d5db;line-height:1.4;"><span style="color:#34d399;">↓</span> ${r.headline}</p>`
          ).join("")
        : "";
      return summary + concerns + reassurances;
    })() : (s.topExplanation
        ? `<p style="margin:8px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;padding-left:10px;border-left:2px solid #1f1f1f;">${s.topExplanation}</p>`
        : "");

    return `
      <tr>
        <td style="padding:16px 0;border-bottom:1px solid #1a1a1a;vertical-align:top;">
          <!-- Ticker header -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-family:monospace;font-size:16px;font-weight:700;color:#f59e0b;">${s.ticker}</span>
                <span style="font-family:monospace;font-size:11px;color:#4b5563;margin-left:8px;text-transform:uppercase;letter-spacing:0.05em;">${s.filing_type}</span>
              </td>
              <td align="right">
                <span style="font-family:monospace;font-size:11px;font-weight:700;color:${color};">${s.maxScore}/10 ${label}</span>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding-top:2px;">
                <span style="font-family:monospace;font-size:11px;color:#4b5563;">${s.date_old} → ${s.date_new}</span>
              </td>
            </tr>
          </table>

          <!-- Stats row -->
          <table style="margin-top:8px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:16px;">
                <span style="font-size:12px;color:#9ca3af;">${s.nChanges} change${s.nChanges !== 1 ? "s" : ""}</span>
              </td>
              <td style="padding-right:16px;">
                <span style="font-size:12px;color:${color};">${s.highCount} high-novelty</span>
              </td>
              <td>
                <span style="font-size:12px;color:${dirColor};">${dirIcon} ${s.direction}</span>
              </td>
            </tr>
          </table>

          <!-- Synthesis / top finding -->
          ${synthesisBlock}

          <!-- CTA -->
          <p style="margin:10px 0 0;">
            <a href="${diffUrl}" style="font-size:12px;color:#f59e0b;text-decoration:none;font-family:monospace;">
              View full analysis →
            </a>
          </p>
        </td>
      </tr>`;
  }).join("");

  const now = new Date();
  const weekEnd = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

        <!-- Logo + period -->
        <tr><td style="padding-bottom:28px;">
          <p style="margin:0;font-family:monospace;font-size:16px;font-weight:700;color:#f0f0f0;letter-spacing:0.05em;">
            FOOTNOTE
          </p>
          <p style="margin:3px 0 0;font-family:monospace;font-size:11px;color:#4b5563;text-transform:uppercase;letter-spacing:0.1em;">
            Weekly Digest · ${weekEnd}
          </p>
        </td></tr>

        <!-- Intro -->
        <tr><td style="padding-bottom:20px;">
          <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
            Here&apos;s what changed across your watched tickers this week.
            ${summaries.length} ticker${summaries.length !== 1 ? "s" : ""} had filing activity —
            ${summaries.filter(s => s.highCount > 0).length} with high-novelty changes.
          </p>
        </td></tr>

        <!-- Divider -->
        <tr><td style="height:1px;background:#1a1a1a;margin-bottom:8px;"></td></tr>
        <tr><td style="height:8px;"></td></tr>

        <!-- Ticker rows -->
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${tickerRows}
          </table>
        </td></tr>

        <tr><td style="height:32px;"></td></tr>

        <!-- CTA banner -->
        <tr><td style="padding:20px;background:#111111;border:1px solid #1f1f1f;border-radius:8px;text-align:center;">
          <p style="margin:0 0 12px;font-size:13px;color:#9ca3af;">
            Review all your watched tickers at once.
          </p>
          <a href="${APP_URL}/watchlist"
             style="display:inline-block;background:#f59e0b;color:#0a0a0a;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;font-family:monospace;">
            Open watchlist →
          </a>
        </td></tr>

        <tr><td style="height:36px;"></td></tr>

        <!-- Footer -->
        <tr><td style="border-top:1px solid #1a1a1a;padding-top:18px;">
          <p style="margin:0 0 6px;font-size:11px;color:#374151;line-height:1.6;">
            You&apos;re on the Pro plan. Manage your watchlist and alert thresholds at
            <a href="${APP_URL}/watchlist" style="color:#4b5563;">${APP_URL}/watchlist</a>.
          </p>
          <p style="margin:0;font-size:10px;color:#374151;">
            Not financial advice. For informational purposes only.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
