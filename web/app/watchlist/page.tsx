"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

type WatchedTicker = {
  ticker: string;
  threshold: number;
  added_at: string;
};

const THRESHOLD_LABELS: Record<number, string> = {
  4: "Notable (4+)",
  7: "High (7+)",
  9: "Critical (9+)",
};

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchedTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [addTicker, setAddTicker] = useState("");
  const [addThreshold, setAddThreshold] = useState(7);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWatchlist = async () => {
    try {
      const [wRes, sRes] = await Promise.all([
        fetch("/api/watchlist"),
        fetch("/api/subscription"),
      ]);
      if (wRes.ok) setItems(await wRes.json());
      if (sRes.ok) {
        const s = await sRes.json();
        setPlan(s.plan ?? "free");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWatchlist(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = addTicker.trim();
    if (!raw) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: raw.toUpperCase(), threshold: addThreshold }),
      });
      if (res.ok) {
        setAddTicker("");
        await fetchWatchlist();
      } else {
        const d = await res.json();
        setError(d.error ?? "Failed to add");
      }
    } finally {
      setAdding(false);
    }
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
          <UserButton appearance={{ variables: { colorPrimary: "#f59e0b" }, elements: { avatarBox: "w-8 h-8" } }} />
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">

        {/* Add form — pro only */}
        {plan === "pro" ? (
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4">Add ticker</p>
            <form onSubmit={handleAdd} className="flex gap-2 flex-wrap">
              <input
                type="text"
                value={addTicker}
                onChange={(e) => setAddTicker(e.target.value)}
                placeholder="AAPL, MSFT, BA…"
                className="h-10 px-3 bg-bg-surface border border-bg-border rounded text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors w-44"
              />
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
          </div>
        ) : !loading ? (
          <div className="rounded-xl border border-accent/30 bg-accent/5 px-6 py-6 flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-semibold text-text-primary mb-1">Footnote Pro — $9/month <span className="text-text-muted font-normal text-xs">early access</span></p>
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
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-4">
            Watching {items.length > 0 ? `· ${items.length} ticker${items.length !== 1 ? "s" : ""}` : ""}
          </p>

          {loading ? (
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-bg-border px-6 py-10 text-center">
              <p className="text-sm text-text-muted mb-1">No tickers yet.</p>
              <p className="text-xs text-text-muted/60">Add a ticker above to start tracking filing changes.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-bg-border divide-y divide-bg-border overflow-hidden">
              {items.map((item) => (
                <div key={item.ticker} className="px-5 py-4 flex items-center gap-4">
                  {/* Ticker + link */}
                  <Link
                    href={`/diff/${item.ticker}`}
                    className="font-mono text-sm font-bold text-accent hover:text-accent/80 transition-colors w-20 shrink-0"
                  >
                    {item.ticker}
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

                  {/* View diff link */}
                  <Link
                    href={`/diff/${item.ticker}`}
                    className="text-xs text-text-muted hover:text-text-secondary transition-colors whitespace-nowrap ml-auto"
                  >
                    View latest →
                  </Link>

                  {/* Remove */}
                  <button
                    onClick={() => handleRemove(item.ticker)}
                    className="text-xs text-text-muted/50 hover:text-diff-rem-text transition-colors shrink-0"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        {items.length > 0 && (
          <p className="text-xs text-text-muted/60 leading-relaxed">
            You&apos;ll be emailed when a new 10-K or 10-Q is filed and contains a change at or above your alert threshold.
          </p>
        )}

      </div>
    </div>
  );
}
