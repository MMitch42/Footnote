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

const COMPANY_TICKERS: Record<string, string> = {
  "apple": "AAPL", "microsoft": "MSFT", "nvidia": "NVDA", "amazon": "AMZN",
  "alphabet": "GOOGL", "google": "GOOGL", "meta": "META", "facebook": "META",
  "instagram": "META", "whatsapp": "META", "tesla": "TSLA", "broadcom": "AVGO",
  "salesforce": "CRM", "oracle": "ORCL", "intel": "INTC", "amd": "AMD",
  "qualcomm": "QCOM", "netflix": "NFLX", "adobe": "ADBE", "uber": "UBER",
  "airbnb": "ABNB", "palantir": "PLTR", "snowflake": "SNOW", "shopify": "SHOP",
  "spotify": "SPOT", "lyft": "LYFT", "coinbase": "COIN", "robinhood": "HOOD",
  "jpmorgan": "JPM", "jp morgan": "JPM", "chase": "JPM",
  "bank of america": "BAC", "wells fargo": "WFC", "goldman sachs": "GS",
  "goldman": "GS", "morgan stanley": "MS", "citigroup": "C", "citi": "C",
  "visa": "V", "mastercard": "MA", "american express": "AXP", "amex": "AXP",
  "blackrock": "BLK", "berkshire": "BRK.B", "berkshire hathaway": "BRK.B",
  "boeing": "BA", "lockheed martin": "LMT", "lockheed": "LMT",
  "raytheon": "RTX", "general electric": "GE", "caterpillar": "CAT",
  "3m": "MMM", "ups": "UPS", "fedex": "FDX", "deere": "DE",
  "johnson & johnson": "JNJ", "johnson and johnson": "JNJ", "j&j": "JNJ",
  "pfizer": "PFE", "moderna": "MRNA", "unitedhealth": "UNH", "abbott": "ABT",
  "merck": "MRK", "eli lilly": "LLY", "lilly": "LLY", "cvs": "CVS",
  "walmart": "WMT", "target": "TGT", "costco": "COST", "home depot": "HD",
  "nike": "NKE", "coca-cola": "KO", "coke": "KO", "pepsi": "PEP",
  "pepsico": "PEP", "mcdonald's": "MCD", "mcdonalds": "MCD",
  "starbucks": "SBUX", "disney": "DIS", "comcast": "CMCSA",
  "exxon": "XOM", "exxonmobil": "XOM", "chevron": "CVX",
  "conocophillips": "COP", "shell": "SHEL",
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

const HEADLINE = "The signal\nin the filings.";

export default function Home() {
  const [ticker, setTicker] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();

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

  // Scroll fade-in refs
  const { ref: demoRef, inView: demoInView } = useInView();
  const { ref: howRef, inView: howInView } = useInView();
  const { ref: waitlistRef, inView: waitlistInView } = useInView();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = ticker.trim();
    if (!raw) return;
    const resolved = COMPANY_TICKERS[raw.toLowerCase()] ?? raw.toUpperCase();
    router.push(`/diff/${resolved}`);
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
          <span className="font-mono text-sm font-bold text-text-primary tracking-tight">FOOTNOTE</span>
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
            Footnote diffs consecutive SEC 10-K and 10-Q filings and scores every language change for
            semantic materiality. Know what companies quietly rewrote before the market reacts.
          </p>

          <form onSubmit={handleSearch} className="flex max-w-sm">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="Ticker or company name"
              className="flex-1 h-10 px-3 bg-bg-surface border border-bg-border border-r-0 rounded-l text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-150"
            />
            <button
              type="submit"
              className="px-5 h-10 bg-text-primary text-bg-base text-sm font-semibold rounded-r hover:bg-text-primary/90 transition-colors duration-150 whitespace-nowrap"
            >
              Analyze →
            </button>
          </form>
          <p className="text-xs text-text-muted mt-2">
            Try: Boeing, Apple, NVDA, JPMorgan
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6">

        {/* Live demo */}
        <div ref={demoRef} className={`mb-20 transition-all duration-700 ${demoInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Live example</span>
            <div className="h-px flex-1 bg-bg-border" />
            <span className="font-mono text-xs text-text-muted">AAPL · 10-K · Item 1A</span>
          </div>

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

        {/* Stats */}
        <div ref={statsRef} className="border-t border-bg-border py-14 grid grid-cols-1 sm:grid-cols-2 gap-10 mb-14">
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
            <div className="flex items-center gap-3 mt-5 flex-wrap">
              <div className="flex items-baseline gap-2">
                <span className="text-text-muted font-normal line-through text-sm">$29</span>
                <span className="text-base font-semibold text-accent">$9/month</span>
                <span className="text-sm text-text-muted font-normal">early access</span>
              </div>
              <a
                href="/upgrade"
                className="text-sm font-medium px-3 h-7 flex items-center bg-accent text-bg-base rounded hover:bg-accent-bright transition-colors"
              >
                Subscribe →
              </a>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div ref={howRef} className={`border-t border-bg-border py-14 mb-14 transition-all duration-700 delay-100 ${howInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-10">How it works</p>
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
        <div id="waitlist" ref={waitlistRef} className={`border-t border-bg-border py-14 mb-6 transition-all duration-700 delay-150 ${waitlistInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
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
