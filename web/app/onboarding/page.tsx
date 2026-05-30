"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

// Quick-add chips — mirrors the prefetch list on the backend
const POPULAR: { ticker: string; name: string }[] = [
  { ticker: "AAPL",  name: "Apple" },
  { ticker: "MSFT",  name: "Microsoft" },
  { ticker: "NVDA",  name: "NVIDIA" },
  { ticker: "AMZN",  name: "Amazon" },
  { ticker: "GOOGL", name: "Alphabet" },
  { ticker: "META",  name: "Meta" },
  { ticker: "TSLA",  name: "Tesla" },
  { ticker: "NFLX",  name: "Netflix" },
  { ticker: "JPM",   name: "JPMorgan" },
  { ticker: "XOM",   name: "ExxonMobil" },
  { ticker: "LLY",   name: "Eli Lilly" },
  { ticker: "AVGO",  name: "Broadcom" },
  { ticker: "WMT",   name: "Walmart" },
  { ticker: "ORCL",  name: "Oracle" },
  { ticker: "COST",  name: "Costco" },
  { ticker: "AMD",   name: "AMD" },
  { ticker: "V",     name: "Visa" },
  { ticker: "MA",    name: "Mastercard" },
  { ticker: "KO",    name: "Coca-Cola" },
  { ticker: "BAC",   name: "Bank of America" },
  { ticker: "CRM",   name: "Salesforce" },
  { ticker: "CVX",   name: "Chevron" },
  { ticker: "ABBV",  name: "AbbVie" },
  { ticker: "JNJ",   name: "J&J" },
];

type Company = { ticker: string; name: string };

export default function OnboardingPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<Company[]>([]); // companies added via search
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Company[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const checkedWatchlistRef = useRef(false);

  // Redirect unauthenticated users to sign-in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in?redirect_url=/onboarding");
    }
  }, [isLoaded, isSignedIn, router]);

  // Skip onboarding entirely if user already has watchlist entries
  // (handles returning users who navigate here directly)
  useEffect(() => {
    if (!isSignedIn || checkedWatchlistRef.current) return;
    checkedWatchlistRef.current = true;
    fetch("/api/watchlist")
      .then((r) => (r.ok ? r.json() : []))
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          router.replace("/");
        }
      })
      .catch(() => {});
  }, [isSignedIn, router]);

  // Autocomplete search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setSuggestions([]); return; }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/company-search?q=${encodeURIComponent(q)}`);
        if (res.ok) setSuggestions(await res.json());
      } catch { /* noop */ }
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

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

  const toggle = (ticker: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const addFromSearch = (company: Company) => {
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    // Keep extras list so the chip stays visible after search clears
    if (!POPULAR.find((p) => p.ticker === company.ticker)) {
      setExtras((prev) =>
        prev.find((e) => e.ticker === company.ticker) ? prev : [...prev, company]
      );
    }
    setSelected((prev) => new Set([...prev, company.ticker]));
  };

  const handleSubmit = async () => {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);

    // POST each ticker — server enforces free-tier 2-company cap; ignore 403s
    await Promise.allSettled(
      [...selected].map((ticker) =>
        fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker, threshold: 7 }),
        })
      )
    );

    setDone(true);
    setTimeout(() => router.push("/"), 1000);
  };

  // Loading / not signed in
  if (!isLoaded || !isSignedIn) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Success screen
  if (done) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="font-mono text-xs text-accent uppercase tracking-widest font-bold">
            You&apos;re all set
          </p>
          <p className="text-sm text-text-muted">
            We&apos;ll email you the next time these companies file.
          </p>
        </div>
      </div>
    );
  }

  const allCompanies = [
    ...POPULAR,
    ...extras.filter((e) => !POPULAR.find((p) => p.ticker === e.ticker)),
  ];

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Nav */}
      <nav className="border-b border-bg-border">
        <div className="max-w-3xl mx-auto px-6 h-12 flex items-center">
          <span className="font-mono text-sm font-bold text-text-primary tracking-tight">
            FOOTNOTE
          </span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-14">

        {/* Header */}
        <div className="mb-10">
          <p className="font-mono text-[10px] text-accent uppercase tracking-widest font-bold mb-3">
            One last thing
          </p>
          <h1 className="font-mono text-2xl sm:text-3xl font-bold text-text-primary mb-4 leading-tight">
            Which companies do you<br className="hidden sm:block" /> want to watch?
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed max-w-md">
            We&apos;ll email you the next time one of these files a significant 10-K or 10-Q.
            Pick anything you already follow.
          </p>
        </div>

        {/* Search box */}
        <div ref={searchRef} className="relative mb-8 max-w-xs">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search any ticker or company…"
            autoComplete="off"
            className="w-full h-10 px-3 bg-bg-surface border border-bg-border rounded text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 transition-colors"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-bg-surface border border-bg-border rounded-lg overflow-hidden z-20 shadow-xl">
              {suggestions.slice(0, 6).map((s) => (
                <button
                  key={s.ticker}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); addFromSearch(s); }}
                  className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-bg-raised transition-colors"
                >
                  <span className="font-mono text-xs font-bold text-accent shrink-0">{s.ticker}</span>
                  <span className="text-xs text-text-muted truncate">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Company chips */}
        <div className="flex flex-wrap gap-2 mb-10">
          {allCompanies.map((c) => {
            const on = selected.has(c.ticker);
            return (
              <button
                key={c.ticker}
                type="button"
                onClick={() => toggle(c.ticker)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all duration-100 select-none ${
                  on
                    ? "bg-accent/10 border-accent/50 text-text-primary"
                    : "bg-bg-surface border-bg-border text-text-muted hover:border-accent/30 hover:text-text-secondary"
                }`}
              >
                <span className="font-mono text-[11px] font-bold">{c.ticker}</span>
                <span className="text-xs text-text-muted">{c.name}</span>
                {on && <span className="text-accent text-[10px] font-bold">✓</span>}
              </button>
            );
          })}
        </div>

        {/* CTA row */}
        <div className="flex items-center gap-5 flex-wrap">
          <button
            onClick={handleSubmit}
            disabled={selected.size === 0 || submitting}
            className="h-11 px-6 bg-accent text-bg-base text-sm font-semibold rounded-lg hover:bg-accent-bright transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-mono whitespace-nowrap"
          >
            {submitting
              ? "Setting up…"
              : selected.size === 0
              ? "Select at least one →"
              : `Watch ${selected.size} ${selected.size === 1 ? "company" : "companies"} →`}
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            Skip for now
          </button>
        </div>

        <p className="text-xs text-text-muted mt-5 leading-relaxed">
          You can update your watchlist any time.{" "}
          Free plan includes up to 2 companies —{" "}
          <a href="/upgrade" className="text-accent/70 hover:text-accent transition-colors">
            upgrade
          </a>{" "}
          for unlimited.
        </p>

      </div>
    </div>
  );
}
