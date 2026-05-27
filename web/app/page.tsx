"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";

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
  const router = useRouter();

  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => r.ok ? r.json() : { plan: "free" })
      .then((d) => setPlan(d.plan ?? "free"))
      .catch(() => setPlan("free"));
  }, []);

  // Typewriter
  const [typed, setTyped] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(HEADLINE.slice(0, i));
      if (i >= HEADLINE.length) { setTypingDone(true); clearInterval(id); }
    }, 38);
    return () => clearInterval(id);
  }, []);

  // Counter for 188bps
  const { ref: statsRef, inView: statsInView } = useInView();
  const [bps, setBps] = useState(0);
  useEffect(() => {
    if (!statsInView) return;
    const TARGET = 188;
    const DURATION = 1000;
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setBps(Math.round(ease * TARGET));
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
    router.push(`/diff/${resolved}`);
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
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          <span className="font-mono text-sm font-bold text-text-primary tracking-tight ml-10">FOOTNOTE</span>
          <div className="flex items-center gap-4">
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
                Sign up →
              </a>
            </Show>
            <Show when="signed-in">
              <a
                href="/watchlist"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
              >
                Watchlist
              </a>
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
        </div>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 90% 60% at 50% -5%, rgba(245,158,11,0.09) 0%, transparent 65%)" }}
        />
        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-16">
          <h1 className="font-mono text-4xl font-bold text-text-primary leading-tight mb-5 max-w-xl whitespace-pre-line">
            {typed}{!typingDone && <span className="text-accent animate-pulse">_</span>}
          </h1>
          <p className="text-base text-text-secondary leading-relaxed mb-10 max-w-lg">
            Every time a company files a new 10-K or 10-Q, Footnote compares it to the previous one.
            Changed passages are scored for significance. When something material shifts in the risk factors,
            MD&amp;A, or legal disclosures, you find out. Usually before most people notice.
          </p>

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
          <p className="text-xs text-text-muted mt-2">
            Any public company. See exactly what changed in their last filing.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6">

        {/* Live demo */}
        <div ref={demoRef} className={`mb-14 transition-all duration-700 ${demoInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Real example</span>
            <div className="h-px flex-1 bg-bg-border" />
            <span className="font-mono text-xs text-text-muted">AAPL · 10-K · Item 1A</span>
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
        </div>

        {/* Recent filing changes feed */}
        {(feedLoading || recentFeed.length > 0) && (
          <div className="border-t border-bg-border py-14 mb-0">
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
                      onClick={() => router.push(`/diff/${entry.ticker}`)}
                      className="w-full text-left px-4 py-3 flex items-center gap-4 hover:bg-bg-raised transition-colors duration-100 group"
                    >
                      {/* Score dot */}
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />

                      {/* Ticker + type */}
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <span className="font-mono text-sm font-bold text-text-primary">{entry.ticker}</span>
                        <span className="font-mono text-[10px] px-1 py-0.5 rounded border border-bg-border text-text-muted uppercase">{entry.filing_type}</span>
                      </div>

                      {/* Score */}
                      <div className="flex items-center gap-1.5 w-28 shrink-0">
                        <span className={`font-mono text-sm font-bold tabular-nums ${scoreColor}`}>{entry.max_score}/10</span>
                        <span className={`text-xs ${scoreColor}`}>{scoreLabel}</span>
                      </div>

                      {/* Direction */}
                      <span className={`text-xs w-24 shrink-0 ${dirColor || "text-text-muted"}`}>
                        {dirLabel ?? "Neutral"}
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

        {/* Stats */}
        <div ref={statsRef} className="border-t border-bg-border py-14 grid grid-cols-1 sm:grid-cols-2 gap-10">
          <div>
            <p className="font-mono text-5xl font-bold text-text-primary mb-1 tabular-nums">
              {bps}<span className="text-accent">bps</span>
            </p>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-4">per month, documented alpha</p>
            <p className="text-sm text-text-secondary leading-relaxed">
              Monthly alpha from SEC filing language changes, documented in peer-reviewed research.
            </p>
          </div>
          <div className="pt-10 sm:pt-0 border-t border-bg-border sm:border-t-0 sm:border-l sm:pl-10">
            <p className="text-sm text-text-secondary leading-relaxed">
              Cohen, Malloy &amp; Nguyen (Journal of Finance, 2020): companies that change their 10-K
              language underperform by 22% annually. Institutional research platforms charge up to
              $15,000/year for this signal.
            </p>
            <div className="mt-6 space-y-3">
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
            </div>
          </div>
        </div>

        {/* How it works */}
        <div ref={howRef} className={`border-t border-bg-border py-14 transition-all duration-700 delay-100 ${howInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
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
        </div>

        {/* Waitlist */}
        <div id="waitlist" ref={waitlistRef} className={`border-t border-bg-border py-14 transition-all duration-700 delay-150 ${waitlistInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          <div className="max-w-lg">
            <p className="text-lg font-semibold text-text-primary mb-1">Not ready to subscribe?</p>
            <p className="text-sm text-text-muted mb-6">Leave your email and we&apos;ll let you know when new features ship. No credit card, no spam.</p>
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
                  Join →
                </button>
              </form>
            )}
          </div>
        </div>

      </div>{/* /max-w-5xl */}

      {/* Footer */}
      <div className="border-t border-bg-border py-8">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between flex-wrap gap-4">
          <span className="font-mono text-xs text-text-muted">© 2026 Mitchell Magid</span>
          <div className="flex items-center gap-6">
            <a href="/terms" className="text-xs text-text-muted hover:text-text-secondary transition-colors">Terms</a>
            <a href="/privacy" className="text-xs text-text-muted hover:text-text-secondary transition-colors">Privacy</a>
            <a href="mailto:mitchell.magid@gmail.com" className="text-xs text-text-muted hover:text-text-secondary transition-colors">Contact</a>
          </div>
        </div>
      </div>

    </div>
  );
}
