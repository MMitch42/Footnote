"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

type WatchedTicker = {
  ticker: string;
  threshold: number;
  added_at: string;
};

type Company = { ticker: string; name: string };

function WatchlistContent() {
  const searchParams = useSearchParams();
  const justUpgraded = searchParams.get("upgraded") === "true";
  const [items, setItems] = useState<WatchedTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<"free" | "pro" | "research" | null>(null);
  const [addTicker, setAddTicker] = useState("");
  const [addThreshold, setAddThreshold] = useState(7);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Company[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({});
  const [digestOptIn, setDigestOptIn] = useState(false);
  const [digestToggling, setDigestToggling] = useState(false);
  const [listFilter, setListFilter] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);

  const fetchWatchlist = async () => {
    try {
      const [wRes, sRes, pRes] = await Promise.all([
        fetch("/api/watchlist"),
        fetch("/api/subscription"),
        fetch("/api/preferences"),
      ]);
      if (wRes.ok) setItems(await wRes.json());
      if (sRes.ok) {
        const s = await sRes.json();
        setPlan(s.plan ?? "free");
      }
      if (pRes.ok) {
        const p = await pRes.json();
        setDigestOptIn(p.digest_opt_in ?? false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDigest = async () => {
    setDigestToggling(true);
    const next = !digestOptIn;
    setDigestOptIn(next); // optimistic
    try {
      const res = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest_opt_in: next }),
      });
      if (!res.ok) setDigestOptIn(!next); // revert on failure
    } catch {
      setDigestOptIn(!next);
    } finally {
      setDigestToggling(false);
    }
  };

  useEffect(() => { fetchWatchlist(); }, []);

  // Fetch company names for all watchlisted tickers
  useEffect(() => {
    if (items.length === 0) return;
    const tickers = items.map((i) => i.ticker).join(",");
    fetch(`/api/company-names?tickers=${tickers}`)
      .then((r) => r.ok ? r.json() : {})
      .then((map) => setCompanyNames(map))
      .catch(() => {});
  }, [items]);

  // Autocomplete fetch
  useEffect(() => {
    const q = addTicker.trim();
    if (q.length < 1) { setSuggestions([]); return; }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/company-search?q=${encodeURIComponent(q)}`);
        if (res.ok) setSuggestions(await res.json());
      } catch { /* noop */ }
    }, 200);
    return () => clearTimeout(id);
  }, [addTicker]);

  // Close autocomplete on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAdd = async (tickerVal: string) => {
    const raw = tickerVal.trim().toUpperCase();
    if (!raw) return;
    setAdding(true);
    setError(null);
    setShowSuggestions(false);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: raw, threshold: addThreshold }),
      });
      if (res.ok) {
        setAddTicker("");
        setSuggestions([]);
        await fetchWatchlist();
      } else {
        const d = await res.json();
        setError(d.error ?? "Failed to add");
      }
    } finally {
      setAdding(false);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeIdx >= 0 && suggestions[activeIdx]) {
      handleAdd(suggestions[activeIdx].ticker);
    } else if (suggestions.length > 0) {
      handleAdd(suggestions[0].ticker);
    } else {
      handleAdd(addTicker.split(/\s+/)[0]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); }
    if (e.key === "Escape")    { setShowSuggestions(false); setActiveIdx(-1); }
  };

  const handleRemove = async (ticker: string) => {
    await fetch(`/api/watchlist/${ticker}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.ticker !== ticker));
  };

  const handleThreshold = async (ticker: string, threshold: number) => {
    await fetch(`/api/watchlist/${ticker}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threshold }),
    });
    setItems((prev) => prev.map((i) => i.ticker === ticker ? { ...i, threshold } : i));
  };

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Nav */}
      <nav className="border-b border-bg-border">
        <div className="max-w-3xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-mono text-sm font-bold text-text-primary hover:text-accent transition-colors duration-150">
              FOOTNOTE
            </Link>
            <span className="text-text-muted">/</span>
            <span className="font-mono text-sm text-text-secondary">WATCHLIST</span>
          </div>
          <div className="flex items-center gap-4">
            {plan === "free" && (
              <a
                href="/upgrade"
                className="text-sm font-semibold px-4 h-8 flex items-center bg-accent text-bg-base rounded hover:bg-accent-bright transition-colors duration-150 whitespace-nowrap"
              >
                Get Pro →
              </a>
            )}
            <UserButton appearance={{ variables: { colorPrimary: "#f59e0b" }, elements: { avatarBox: "w-8 h-8" } }} />
          </div>
        </div>
      </nav>

      {/* Upgrade success banner */}
      {justUpgraded && (
        <div className="border-b border-diff-add-border bg-diff-add/20 px-6 py-3 flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-diff-add-text shrink-0" />
          <p className="text-sm text-diff-add-text">
            {plan === "research"
              ? "You're on Research. Add tickers to get alerts, then explore full filing history for each one."
              : "You're on Pro. Add your first ticker below and we'll alert you when something changes."}
          </p>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">

        {/* Add form (pro only) */}
        {(plan === "pro" || plan === "research") ? (
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4">Add company</p>
            <form onSubmit={handleAddSubmit} className="flex gap-2 flex-wrap items-start">
              <div ref={searchRef} className="relative">
                <input
                  type="text"
                  value={addTicker}
                  onChange={(e) => { setAddTicker(e.target.value); setShowSuggestions(true); setActiveIdx(-1); }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ticker or company name"
                  autoComplete="off"
                  className="h-10 px-3 bg-bg-surface border border-bg-border rounded text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors w-56"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-bg-surface border border-bg-border rounded-lg overflow-hidden z-20 shadow-xl">
                    {suggestions.map((s, i) => (
                      <button
                        key={s.ticker}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleAdd(s.ticker); }}
                        className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition-colors duration-75 ${i === activeIdx ? "bg-bg-raised" : "hover:bg-bg-raised"}`}
                      >
                        <span className="text-sm text-text-secondary truncate">{s.name}</span>
                        <span className="font-mono text-xs font-semibold text-accent shrink-0">{s.ticker}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <select
                value={addThreshold}
                onChange={(e) => setAddThreshold(Number(e.target.value))}
                className="h-10 px-3 bg-bg-surface border border-bg-border rounded text-sm text-text-secondary focus:outline-none focus:border-accent transition-colors"
              >
                <option value={4}>Alert: Notable (4+)</option>
                <option value={7}>Alert: High (7+)</option>
                <option value={9}>Alert: Critical (9+)</option>
              </select>
              <button
                type="submit"
                disabled={adding}
                className="h-10 px-5 bg-text-primary text-bg-base text-sm font-semibold rounded hover:bg-text-primary/90 transition-colors disabled:opacity-50"
              >
                {adding ? "Adding…" : "Watch →"}
              </button>
            </form>
            {error && <p className="text-xs text-diff-rem-text mt-2">{error}</p>}
            {/* Onboarding nudge — shown right after upgrading with empty watchlist */}
            {justUpgraded && items.length === 0 && !adding && (
              <p className="text-xs text-accent mt-3 animate-pulse">
                ↑ Add your first ticker to start getting filing alerts
              </p>
            )}
          </div>
        ) : plan === "free" ? (
          <div className="rounded-xl border border-accent/30 bg-accent/5 px-6 py-6 flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-semibold text-text-primary mb-1">Footnote Pro: $9/month <span className="text-text-muted font-normal text-xs">early access</span></p>
              <p className="text-sm text-text-secondary leading-relaxed max-w-sm">
                Add tickers and get emailed the moment a company quietly rewrites a risk factor or litigation disclosure.
              </p>
            </div>
            <Link
              href="/upgrade"
              className="shrink-0 h-9 px-5 flex items-center bg-accent text-bg-base text-sm font-semibold rounded-lg hover:bg-accent-bright transition-colors whitespace-nowrap"
            >
              Upgrade →
            </Link>
          </div>
        ) : null}

        {/* List */}
        <div>
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              Watching {items.length > 0 ? `· ${items.length} ticker${items.length !== 1 ? "s" : ""}` : ""}
            </p>
            {items.length >= 8 && (
              <input
                type="text"
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                placeholder="Filter…"
                className="h-8 px-3 bg-bg-surface border border-bg-border rounded text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors w-36"
              />
            )}
          </div>

          {loading ? (
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-bg-border px-6 py-10 text-center">
              <p className="text-sm text-text-muted mb-2">No companies yet.</p>
              {plan === "free" ? (
                <a
                  href="/onboarding"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-bright transition-colors"
                >
                  Set up your alerts →
                </a>
              ) : (
                <p className="text-xs text-text-muted">Add a ticker above to start tracking filing changes.</p>
              )}
            </div>
          ) : (() => {
            const q = listFilter.trim().toLowerCase();
            const visible = q
              ? items.filter((i) =>
                  i.ticker.toLowerCase().includes(q) ||
                  (companyNames[i.ticker] ?? "").toLowerCase().includes(q)
                )
              : items;
            return visible.length === 0 ? (
              <div className="rounded-xl border border-bg-border px-6 py-8 text-center">
                <p className="text-sm text-text-muted">No matches for &ldquo;{listFilter}&rdquo;</p>
              </div>
            ) : (
            <div className="rounded-xl border border-bg-border divide-y divide-bg-border overflow-hidden">
              {visible.map((item) => (
                <div key={item.ticker} className="px-5 py-4 flex items-center gap-4">
                  {/* Company name + ticker */}
                  <Link
                    href={`/diff/${item.ticker}`}
                    className="flex items-baseline gap-2 hover:opacity-80 transition-opacity min-w-0 flex-1 max-w-[220px]"
                  >
                    <span className="text-sm text-text-primary truncate">
                      {companyNames[item.ticker] ?? item.ticker}
                    </span>
                    {companyNames[item.ticker] && (
                      <span className="font-mono text-xs text-text-muted shrink-0">{item.ticker}</span>
                    )}
                  </Link>

                  {/* Threshold selector */}
                  <select
                    value={item.threshold}
                    onChange={(e) => handleThreshold(item.ticker, Number(e.target.value))}
                    className="h-8 px-2 bg-bg-surface border border-bg-border rounded text-xs text-text-secondary focus:outline-none focus:border-accent transition-colors flex-1 max-w-[180px]"
                  >
                    <option value={4}>Alert: Notable (4+)</option>
                    <option value={7}>Alert: High (7+)</option>
                    <option value={9}>Alert: Critical (9+)</option>
                  </select>

                  {/* Links */}
                  <div className="flex items-center gap-3 ml-auto">
                    {plan === "research" && (
                      <Link
                        href={`/history/${item.ticker}`}
                        className="text-xs text-accent hover:text-accent-bright transition-colors whitespace-nowrap"
                      >
                        History
                      </Link>
                    )}
                    <Link
                      href={`/diff/${item.ticker}`}
                      className="text-xs text-text-muted hover:text-text-secondary transition-colors whitespace-nowrap"
                    >
                      Latest →
                    </Link>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => handleRemove(item.ticker)}
                    className="text-xs text-text-muted hover:text-diff-rem-text transition-colors shrink-0"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            );
          })()}
        </div>

        {/* Info */}
        {items.length > 0 && (
          <p className="text-xs text-text-muted leading-relaxed">
            You&apos;ll be emailed when a new 10-K or 10-Q is filed and contains a change at or above your alert threshold.
          </p>
        )}

        {/* Email preferences — Pro only */}
        {(plan === "pro" || plan === "research") && (
          <div className="border-t border-bg-border pt-8 space-y-8">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4">Email preferences</p>
              <div className="rounded-xl border border-bg-border divide-y divide-bg-border overflow-hidden">

                {/* Instant alerts — always on, not toggleable */}
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">Filing alerts</p>
                    <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                      Emailed immediately when a watched ticker files and hits your threshold.
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-[10px] font-mono text-diff-add-text uppercase tracking-wider">Always on</span>
                    <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-accent opacity-60 cursor-not-allowed">
                      <span className="inline-block h-4 w-4 translate-x-6 rounded-full bg-bg-base shadow" />
                    </div>
                  </div>
                </div>

                {/* Weekly digest — toggleable */}
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">Weekly digest</p>
                    <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                      A weekly summary of all your tickers&apos; filing activity.
                    </p>
                  </div>
                  <button
                    onClick={handleToggleDigest}
                    disabled={digestToggling}
                    role="switch"
                    aria-checked={digestOptIn}
                    className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                      digestOptIn ? "bg-accent" : "bg-bg-raised border border-bg-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full shadow transition-transform duration-200 ${
                        digestOptIn ? "translate-x-6 bg-bg-base" : "translate-x-1 bg-text-muted"
                      }`}
                    />
                  </button>
                </div>

              </div>
            </div>

            {/* Billing management */}
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4">Billing</p>
              <Link
                href="/account"
                className="inline-flex items-center h-9 px-4 border border-bg-border text-sm text-text-secondary rounded-lg hover:border-accent/40 hover:text-text-primary transition-colors"
              >
                Manage billing →
              </Link>
              <p className="text-xs text-text-muted mt-2 leading-relaxed">
                Update payment method, view invoices, or cancel your subscription.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function WatchlistPage() {
  return (
    <Suspense>
      <WatchlistContent />
    </Suspense>
  );
}
