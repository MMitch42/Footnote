"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Show, UserButton, useUser } from "@clerk/nextjs";

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, inView };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type Company = { ticker: string; name: string };
type RecentEntry = {
  ticker: string;
  company_name?: string;
  filing_type: string;
  date_new: string;
  date_old: string;
  max_score: number;
  n_changes: number;
  direction: "escalating" | "reassuring" | "neutral";
};

const DEMO = {
  dateNew: "Oct 2025", dateOld: "Nov 2024",
  explanation: "Apple replaced a general reference to past U.S.-China tensions with specific disclosures naming the 2025 tariff announcements, affected countries, and an active Section 232 semiconductor investigation. The shift from past-tense observation to present-tense enumeration of live regulatory actions is substantive.",
  old: "For example, tensions between governments, including the U.S. and China, have in the past led to tariffs and other restrictions affecting the Company's business. If disputes and conflicts further escalate in the future, actions by governments in response could be significantly more severe and restrictive and could materially adversely affect the Company's business.",
  new: "Beginning in the second quarter of 2025, new tariffs were announced on imports to the U.S. (\"U.S. Tariffs\"), including additional tariffs on imports from China, India, Japan, South Korea, Taiwan, Vietnam and the European Union (\"EU\"), among others. In response, several countries have imposed, or threatened to impose, reciprocal tariffs on imports from the U.S. and other retaliatory measures. Various modifications to the U.S. Tariffs have been announced and further changes could be made in the future, which may include additional sector-based tariffs or other measures. For example, the U.S. Department of Commerce has initiated an investigation under Section 232 of the Trade Expansion Act of 1962 into imports of semiconductors and their derivative products. The ultimate impact remains uncertain and will depend on whether additional U.S. Tariffs are imposed, to what extent other countries implement retaliatory measures, and the overall magnitude and duration of these measures.",
};

const STEPS = [
  { n: "01", title: "Enter any ticker or company.", body: "Footnote fetches the last 10 years of 10-K and 10-Q filings from SEC EDGAR." },
  { n: "02", title: "We diff every consecutive pair.", body: "Each changed passage is scored 1-10 for semantic novelty, not just text similarity." },
  { n: "03", title: "Get alerted when something changes.", body: "Set a novelty threshold. We email you the moment a company quietly rewrites a risk factor or litigation disclosure." },
];

const HEADLINE = "Companies rewrite\ntheir filings.\nWe catch it.";

export default function Home() {
  const [ticker, setTicker] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [plan, setPlan] = useState<"free" | "pro" | "research" | null>(null);
  const [filingType, setFilingType] = useState<"10-K" | "10-Q">("10-K");
  const [watchlistItems, setWatchlistItems] = useState<{ ticker: string }[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const router = useRouter();
  const { isSignedIn } = useUser();

  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => r.ok ? r.json() : { plan: "free" })
      .then((d) => setPlan(d.plan ?? "free"))
      .catch(() => setPlan("free"));
  }, []);

  // Watchlist for signed-in dashboard
  useEffect(() => {
    if (!isSignedIn) { setWatchlistLoading(false); return; }
    fetch("/api/watchlist")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setWatchlistItems(Array.isArray(d) ? d.slice(0, 8) : []); setWatchlistLoading(false); })
      .catch(() => setWatchlistLoading(false));
  }, [isSignedIn]);

  // Typewriter — only for marketing (non-signed-in) view
  const [typed, setTyped] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  useEffect(() => {
    if (isSignedIn) { setTyped(HEADLINE); setTypingDone(true); return; }
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(HEADLINE.slice(0, i));
      if (i >= HEADLINE.length) { setTypingDone(true); clearInterval(id); }
    }, 38);
    return () => clearInterval(id);
  }, [isSignedIn]);

  // Counter for 22% stat
  const { ref: statsRef, inView: statsInView } = useInView();
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!statsInView) return;
    const TARGET = 22;
    const DURATION = 900;
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setPct(Math.round(ease * TARGET));
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [statsInView]);

  // Recent feed
  const [recentFeed, setRecentFeed] = useState<RecentEntry[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  useEffect(() => {
    fetch(`${API_URL}/recent?limit=6`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setRecentFeed(Array.isArray(d) ? d : []); setFeedLoading(false); })
      .catch(() => setFeedLoading(false));
  }, []);

  // Scroll fade-in refs
  const { ref: demoRef, inView: demoInView } = useInView();
  const { ref: howRef, inView: howInView } = useInView();
  const { ref: waitlistRef, inView: waitlistInView } = useInView();

  // Autocomplete
  const [suggestions, setSuggestions] = useState<Company[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = ticker.trim();
    if (q.length < 1) { setSuggestions([]); return; }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/company-search?q=${encodeURIComponent(q)}`);
        if (res.ok) setSuggestions(await res.json());
      } catch { /* noop */ }
    }, 200);
    return () => clearTimeout(id);
  }, [ticker]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navigate = (resolved: string) => {
    setShowSuggestions(false);
    setSuggestions([]);
    const url = filingType === "10-Q" ? `/diff/${resolved}?type=10-Q` : `/diff/${resolved}`;
    router.push(url);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = ticker.trim();
    if (!raw) return;
    // If a suggestion is active use it, otherwise use the first word of input as a ticker
    if (activeIdx >= 0 && suggestions[activeIdx]) {
      navigate(suggestions[activeIdx].ticker);
    } else if (suggestions.length > 0) {
      // Auto-select the top suggestion if user just pressed Enter
      navigate(suggestions[0].ticker);
    } else {
      // Strip spaces — only valid tickers (no spaces) should reach Railway
      navigate(raw.split(/\s+/)[0].toUpperCase());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); }
    if (e.key === "Escape")    { setShowSuggestions(false); setActiveIdx(-1); }
  };

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) setSubmitted(true);
    } catch { /* noop */ }
  };

  return (
    <div className="min-h-screen bg-bg-base">

      {/* Nav */}
      <nav className="relative z-10 border-b border-bg-border">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center gap-6">
          {/* Logo + nav — grouped left, breadcrumb style */}
          <div className="flex items-center gap-2 shrink-0">
            <a href="/" className="font-mono text-sm font-bold text-text-primary tracking-tight hover:text-accent transition-colors duration-150">
              FOOTNOTE
            </a>
            <Show when="signed-in">
              <span className="text-text-muted/40 font-mono text-sm">/</span>
              <a
                href="/watchlist"
                className="font-mono text-sm text-text-muted hover:text-text-primary transition-colors duration-150"
              >
                Watchlist
              </a>
            </Show>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right actions */}
          <Show when="signed-out">
            <a
              href="/sign-in"
              className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
            >
              Sign in
            </a>
            <a
              href="/sign-up"
              className="text-sm font-medium px-4 h-8 flex items-center bg-text-primary text-bg-base rounded hover:bg-text-primary/90 transition-colors duration-150"
            >
              Sign up
            </a>
          </Show>
          <Show when="signed-in">
            {plan === "free" && (
              <a
                href="/upgrade"
                className="text-sm font-semibold px-4 h-8 flex items-center bg-accent text-bg-base rounded hover:bg-accent-bright transition-colors duration-150 whitespace-nowrap"
              >
                Get Pro →
              </a>
            )}
            <UserButton
              appearance={{
                variables: { colorPrimary: "#f59e0b" },
                elements: { avatarBox: "w-8 h-8" },
              }}
            />
          </Show>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 90% 60% at 50% -5%, rgba(245,158,11,0.09) 0%, transparent 65%)" }}
        />
        <div className={`relative z-10 max-w-5xl mx-auto px-6 pb-16 ${isSignedIn ? "pt-12" : "pt-20"}`}>

          {/* Dashboard header — signed-in users */}
          {isSignedIn ? (
            <>
              <p className="font-mono text-[10px] text-accent uppercase tracking-widest mb-3">Dashboard</p>
              <h1 className="font-mono text-2xl font-bold text-text-primary leading-tight mb-6">
                What changed this week?
              </h1>
            </>
          ) : (
            <>
              <h1 className="font-mono text-4xl font-bold text-text-primary leading-tight mb-5 max-w-xl whitespace-pre-line">
                {typed}{!typingDone && <span className="text-accent animate-pulse">_</span>}
              </h1>
              <p className="text-base text-text-secondary leading-relaxed mb-10 max-w-lg">
                Every time a company files a new 10-K or 10-Q, Footnote compares it to the previous one.
                Changed passages are scored for significance. When something material shifts in the risk factors,
                MD&amp;A, or legal disclosures, you find out.
              </p>
            </>
          )}

          {/* Search box */}
          <div ref={searchRef} className="relative max-w-sm">
            <form onSubmit={handleSearch} className="flex">
              <input
                type="text"
                value={ticker}
                onChange={(e) => { setTicker(e.target.value); setShowSuggestions(true); setActiveIdx(-1); }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                placeholder="Ticker or company name"
                autoComplete="off"
                className="flex-1 h-10 px-3 bg-bg-surface border border-bg-border border-r-0 rounded-l text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-150"
              />
              <button
                type="submit"
                className="px-5 h-10 bg-text-primary text-bg-base text-sm font-semibold rounded-r hover:bg-text-primary/90 transition-colors duration-150 whitespace-nowrap"
              >
                Analyze →
              </button>
            </form>

            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-bg-surface border border-bg-border rounded-lg overflow-hidden z-20 shadow-xl">
                {suggestions.map((s, i) => (
                  <button
                    key={s.ticker}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); navigate(s.ticker); }}
                    className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition-colors duration-75 ${
                      i === activeIdx ? "bg-bg-raised" : "hover:bg-bg-raised"
                    }`}
                  >
                    <span className="text-sm text-text-secondary truncate">{s.name}</span>
                    <span className="font-mono text-xs font-semibold text-accent shrink-0">{s.ticker}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filing type toggle — Pro only */}
          {(plan === "pro" || plan === "research") && (
            <div className="flex items-center gap-1.5 mt-2.5">
              {(["10-K", "10-Q"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilingType(type)}
                  className={`px-2.5 py-1 rounded font-mono text-xs font-medium transition-colors duration-150 border ${
                    filingType === type
                      ? "bg-accent/15 border-accent/40 text-accent"
                      : "border-bg-border text-text-muted hover:border-accent/30 hover:text-text-secondary"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}

          {/* "Any public company" hint — marketing view only */}
          {!isSignedIn && (
            <p className="text-xs text-text-muted mt-2">
              Any public company. See exactly what changed in their last filing.
            </p>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6">

        {/* ── Watchlist panel — dashboard only ─────────────────── */}
        {isSignedIn && (
          <div className="py-8 border-b border-bg-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Your watchlist</span>
                {!watchlistLoading && watchlistItems.length > 0 && (
                  <span className="font-mono text-[10px] text-text-muted bg-bg-surface border border-bg-border rounded px-1.5 py-0.5 leading-none">
                    {watchlistItems.length}
                  </span>
                )}
              </div>
              <a href="/watchlist" className="text-xs text-text-muted hover:text-accent transition-colors duration-150">
                Manage →
              </a>
            </div>

            {watchlistLoading ? (
              <div className="flex flex-wrap gap-2">
                {[80, 64, 72].map((w, i) => (
                  <div
                    key={i}
                    className="h-9 rounded-lg bg-bg-surface animate-pulse"
                    style={{ width: w, opacity: 1 - i * 0.25 }}
                  />
                ))}
              </div>
            ) : watchlistItems.length === 0 ? (
              <div className="rounded-xl border border-bg-border border-dashed px-6 py-7 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                <div className="w-9 h-9 rounded-full bg-bg-surface border border-bg-border flex items-center justify-center shrink-0">
                  <span className="text-accent text-sm leading-none">✦</span>
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <p className="text-sm font-medium text-text-primary mb-0.5">No companies tracked yet</p>
                  <p className="text-xs text-text-muted">Add tickers to get email alerts whenever they file.</p>
                </div>
                <a
                  href="/onboarding"
                  className="inline-flex items-center text-sm font-semibold px-4 h-8 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors shrink-0"
                >
                  Set up watchlist →
                </a>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {watchlistItems.map((item) => (
                  <a
                    key={item.ticker}
                    href={`/diff/${item.ticker}`}
                    className="group font-mono text-sm font-medium px-4 py-2 rounded-lg border border-bg-border bg-bg-surface text-text-secondary hover:border-accent/50 hover:text-accent hover:bg-bg-raised transition-all duration-150 flex items-center gap-1.5"
                  >
                    {item.ticker}
                    <span className="text-[10px] text-text-muted/50 group-hover:text-accent/50 transition-colors">→</span>
                  </a>
                ))}
                {/* Add slot */}
                {plan !== "pro" && plan !== "research" && watchlistItems.length >= 2 ? (
                  <a
                    href="/upgrade"
                    className="font-mono text-sm px-4 py-2 rounded-lg border border-dashed border-accent/25 text-accent/50 hover:border-accent/50 hover:text-accent hover:bg-bg-raised transition-all duration-150"
                  >
                    + Upgrade for more
                  </a>
                ) : (
                  <a
                    href="/watchlist"
                    className="font-mono text-sm px-4 py-2 rounded-lg border border-dashed border-bg-border text-text-muted hover:border-accent/40 hover:text-accent hover:bg-bg-raised transition-all duration-150"
                  >
                    + Add
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Signal / Alpha stats — hidden for Pro/Research ───── */}
        {(plan !== "pro" && plan !== "research") && (
          <div ref={statsRef} className="border-t border-bg-border py-14 grid grid-cols-1 sm:grid-cols-2 gap-10">
            <div>
              <p className="font-mono text-5xl font-bold text-text-primary mb-1 tabular-nums">
                {pct}<span className="text-accent">%</span>
              </p>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-4">annual alpha, peer-reviewed</p>
              <p className="text-sm text-text-secondary leading-relaxed mb-3">
                A long-short strategy on 10-K language changes generates ~22% annual abnormal return. Companies that quietly rewrite their filings significantly underperform those that don&apos;t.
              </p>
              <p className="text-xs text-text-muted leading-relaxed">
                Cohen, Malloy &amp; Nguyen, &ldquo;Lazy Prices,&rdquo; <em>Journal of Finance</em>, 2020.
                Institutional research platforms charge up to $15,000/year for this signal.
              </p>
            </div>
            <div className="pt-10 sm:pt-0 border-t border-bg-border sm:border-t-0 sm:border-l sm:pl-10 flex flex-col justify-center">
              {isSignedIn && plan === "free" ? (
                /* Signed-in free: feature list + upgrade */
                <>
                  <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-4">Unlock with Pro</p>
                  <div className="space-y-2.5 mb-5">
                    {[
                      "Instant email alerts when companies file",
                      "Unlimited watchlist (free: 2 companies)",
                      "Footnote AI — ask questions about any diff",
                      "Full synthesis reports on every filing",
                    ].map((f) => (
                      <div key={f} className="flex items-start gap-2.5">
                        <span className="text-accent text-xs shrink-0 mt-0.5">✓</span>
                        <span className="text-sm text-text-secondary">{f}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-end gap-2 mb-3">
                    <span className="font-mono text-2xl font-bold text-text-primary">$9</span>
                    <span className="text-sm text-text-secondary mb-0.5">/month</span>
                    <span className="text-xs text-text-muted line-through mb-1">$29</span>
                  </div>
                  <a
                    href="/upgrade"
                    className="inline-flex items-center text-sm font-semibold px-4 h-9 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors self-start"
                  >
                    Upgrade to Pro →
                  </a>
                </>
              ) : (
                /* Signed-out: pricing card */
                <>
                  <p className="text-xs text-text-muted uppercase tracking-wide font-medium mb-4">Footnote Pro</p>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-end gap-2 mb-1">
                        <span className="font-mono text-3xl font-bold text-text-primary">$9</span>
                        <span className="text-sm text-text-secondary mb-1">/month</span>
                        <span className="text-sm text-text-secondary line-through mb-1">$29</span>
                      </div>
                      <p className="text-xs font-semibold text-accent">Early access. Locked in for life.</p>
                    </div>
                    <a
                      href="/upgrade"
                      className="inline-flex items-center text-sm font-semibold px-4 h-9 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors"
                    >
                      Subscribe →
                    </a>
                    <p className="text-xs text-text-muted leading-relaxed max-w-[200px]">
                      Full intelligence reports, unlimited watchlist, email alerts, and Footnote AI.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* How it works — marketing only */}
        {!isSignedIn && <div ref={howRef} className={`border-t border-bg-border py-14 transition-all duration-700 delay-100 ${howInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">How it works</p>
          <p className="text-sm text-text-secondary mb-10 max-w-lg">
            Built for investors, analysts, and anyone who tracks public companies. No more manually reading filings to see what changed.
          </p>
          <div className="space-y-8 max-w-xl">
            {STEPS.map((step) => (
              <div key={step.n} className="flex gap-8">
                <span className="font-mono text-xs text-accent shrink-0 w-5 pt-0.5">{step.n}</span>
                <div>
                  <p className="text-sm font-semibold text-text-primary mb-1">{step.title}</p>
                  <p className="text-sm text-text-secondary leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>}

        {/* Recent filing changes feed */}
        {(feedLoading || recentFeed.length > 0 || isSignedIn) && (
          <div className="border-t border-bg-border py-14">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Recent filing changes</span>
              </div>
              <div className="h-px flex-1 bg-bg-border" />
            </div>

            {feedLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-11 rounded-lg bg-bg-surface animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
                ))}
              </div>
            ) : recentFeed.length === 0 ? (
              <div className="rounded-xl border border-bg-border px-6 py-10 text-center">
                <p className="text-sm text-text-muted">No new filing changes this week.</p>
                <p className="text-xs text-text-muted mt-1 opacity-60">Check back soon — we process new filings daily.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-bg-border overflow-hidden divide-y divide-bg-border">
                {recentFeed.map((entry, i) => {
                  const scoreColor =
                    entry.max_score >= 9 ? "text-[#f87171]" :
                    entry.max_score >= 7 ? "text-accent" :
                    entry.max_score >= 4 ? "text-[#d97706]" : "text-text-muted";
                  const dotColor =
                    entry.max_score >= 9 ? "bg-[#f87171]" :
                    entry.max_score >= 7 ? "bg-accent" :
                    entry.max_score >= 4 ? "bg-[#d97706]" : "bg-text-muted";
                  const scoreLabel =
                    entry.max_score >= 9 ? "Critical" :
                    entry.max_score >= 7 ? "High" :
                    entry.max_score >= 4 ? "Notable" : "Low";
                  const dirLabel =
                    entry.direction === "escalating" ? "↑ Escalating" :
                    entry.direction === "reassuring"  ? "↓ Reassuring" : null;
                  const dirColor =
                    entry.direction === "escalating" ? "text-[#f87171]" :
                    entry.direction === "reassuring"  ? "text-diff-add-text" : "";

                  return (
                    <button
                      key={i}
                      onClick={() => router.push(`/diff/${entry.ticker}${entry.filing_type === "10-Q" ? "?type=10-Q" : ""}`)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-bg-raised transition-colors duration-100 group"
                    >
                      {/* Score dot */}
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />

                      {/* Company name + ticker + type */}
                      <div className="flex items-center gap-2 min-w-0">
                        {entry.company_name ? (
                          <>
                            <span className="text-sm font-semibold text-text-primary truncate max-w-[140px] sm:max-w-[200px]">{entry.company_name}</span>
                            <span className="font-mono text-xs text-text-muted shrink-0">({entry.ticker})</span>
                          </>
                        ) : (
                          <span className="font-mono text-sm font-bold text-text-primary shrink-0">{entry.ticker}</span>
                        )}
                        <span className="font-mono text-[10px] px-1 py-0.5 rounded border border-bg-border text-text-muted uppercase shrink-0">{entry.filing_type}</span>
                      </div>

                      {/* Score — label hidden on small screens */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`font-mono text-sm font-bold tabular-nums ${scoreColor}`}>{entry.max_score}/10</span>
                        <span className={`text-xs hidden sm:inline ${scoreColor}`}>{scoreLabel}</span>
                      </div>

                      {/* Direction — abbreviated on mobile */}
                      <span className={`text-xs shrink-0 ${dirColor || "text-text-muted"}`}>
                        <span className="sm:hidden">
                          {entry.direction === "escalating" ? "↑" : entry.direction === "reassuring" ? "↓" : "—"}
                        </span>
                        <span className="hidden sm:inline">
                          {dirLabel ?? "Neutral"}
                        </span>
                      </span>

                      {/* Date range */}
                      <span className="font-mono text-xs text-text-muted hidden sm:block flex-1">
                        {entry.date_old} <span className="text-accent">→</span> {entry.date_new}
                      </span>

                      {/* Changes count */}
                      <span className="text-xs text-text-muted hidden md:block w-20 text-right shrink-0">
                        {entry.n_changes} change{entry.n_changes !== 1 ? "s" : ""}
                      </span>

                      <span className="text-text-muted group-hover:text-accent transition-colors text-sm shrink-0">→</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Real example — marketing only */}
        {!isSignedIn && <div ref={demoRef} className={`border-t border-bg-border py-14 transition-all duration-700 ${demoInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Real example</span>
            <div className="h-px flex-1 bg-bg-border" />
            <span className="font-mono text-xs text-text-muted">Apple (AAPL) · 10-K · Item 1A</span>
          </div>
          <p className="text-xs text-text-muted mb-4">
            Apple rewrote this passage between their Nov 2024 and Oct 2025 annual filings. Footnote flagged it as a 9/10 critical change. Here is what shifted and why it matters.
          </p>

          <div className="rounded-xl border border-bg-border overflow-hidden">
            {/* Window chrome */}
            <div className="px-4 py-2.5 bg-bg-raised border-b border-bg-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-bg-border" />
                <div className="w-3 h-3 rounded-full bg-bg-border" />
                <div className="w-3 h-3 rounded-full bg-bg-border" />
              </div>
              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="text-text-muted">{DEMO.dateOld}</span>
                <span className="text-accent">→</span>
                <span className="text-text-secondary">{DEMO.dateNew}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="relative w-1.5 h-1.5 shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#f87171]" />
                  {demoInView && <div className="absolute inset-0 rounded-full bg-[#f87171] animate-ping opacity-50" />}
                </div>
                <span className="font-mono text-xs font-semibold text-[#f87171]">9/10 Critical</span>
              </div>
            </div>
            {/* Removed */}
            <div className="flex border-b border-bg-border/50">
              <div className="w-8 shrink-0 py-3 px-2 text-right font-mono text-xs text-diff-rem-text/40 bg-diff-rem border-r border-bg-border/50 select-none">−</div>
              <div className="flex-1 px-4 py-3 bg-diff-rem/40">
                <p className="font-mono text-sm text-diff-rem-text leading-relaxed">{DEMO.old}</p>
              </div>
            </div>
            {/* Added */}
            <div className="flex border-b border-bg-border/50">
              <div className="w-8 shrink-0 py-3 px-2 text-right font-mono text-xs text-diff-add-text/40 bg-diff-add border-r border-bg-border/50 select-none">+</div>
              <div className="flex-1 px-4 py-3 bg-diff-add/40">
                <p className="font-mono text-sm text-diff-add-text leading-relaxed">{DEMO.new}</p>
              </div>
            </div>
            {/* Analysis */}
            <div className="px-4 py-3 bg-bg-surface flex items-start gap-3">
              <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider shrink-0 mt-0.5">AI Analysis</span>
              <p className="text-sm text-text-secondary leading-relaxed">{DEMO.explanation}</p>
            </div>
          </div>
        </div>}

        {/* Bottom CTA — adapts to auth state */}
        <div id="waitlist" ref={waitlistRef} className={`border-t border-bg-border py-14 transition-all duration-700 delay-150 ${waitlistInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          {isSignedIn ? (
            /* Signed-in: show upgrade nudge (free) or nothing (pro) */
            plan === "free" ? (
              <div className="max-w-lg">
                <p className="text-lg font-semibold text-text-primary mb-1">Ready for personalized alerts?</p>
                <p className="text-sm text-text-muted mb-4">
                  Pro gives you instant email alerts when your watched companies file, unlimited watchlist, and Footnote AI across every diff.
                  Early access: $9/month, locked in for life.
                </p>
                <a
                  href="/upgrade"
                  className="inline-flex items-center text-sm font-semibold px-4 h-9 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors"
                >
                  Upgrade to Pro →
                </a>
              </div>
            ) : null
          ) : (
            /* Signed-out: marketing CTAs */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 max-w-2xl">
              <div>
                <p className="text-lg font-semibold text-text-primary mb-1">Ready to get started?</p>
                <p className="text-sm text-text-muted mb-4">Full synthesis reports, unlimited watchlist, and weekly email alerts.</p>
                <a
                  href="/upgrade"
                  className="inline-flex items-center text-sm font-semibold px-4 h-9 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors"
                >
                  See Pro plan →
                </a>
              </div>
              <div>
                <p className="text-lg font-semibold text-text-primary mb-1">Not ready yet?</p>
                <p className="text-sm text-text-muted mb-4">Leave your email — we&apos;ll notify you when new features ship.</p>
                {submitted ? (
                  <p className="text-sm text-diff-add-text">Got it. We&apos;ll be in touch.</p>
                ) : (
                  <form onSubmit={handleWaitlist} className="flex max-w-sm">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="flex-1 h-10 px-3 bg-bg-surface border border-bg-border border-r-0 rounded-l text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-150"
                    />
                    <button
                      type="submit"
                      className="px-5 h-10 bg-text-primary text-bg-base text-sm font-semibold rounded-r hover:bg-text-primary/90 transition-colors duration-150 whitespace-nowrap"
                    >
                      Join
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

      </div>{/* /max-w-5xl */}

      {/* Footer */}
      <div className="border-t border-bg-border py-8">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-end flex-wrap gap-6">
          <a href="/terms" className="text-xs text-text-muted hover:text-text-secondary transition-colors">Terms</a>
          <a href="/privacy" className="text-xs text-text-muted hover:text-text-secondary transition-colors">Privacy</a>
          <a href="mailto:mitchell.magid@gmail.com" className="text-xs text-text-muted hover:text-text-secondary transition-colors">Contact</a>
        </div>
      </div>

    </div>
  );
}
