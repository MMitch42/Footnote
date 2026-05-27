"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

type Plan = "free" | "pro" | "research" | null;
type WatchedTicker = { ticker: string };
type Company = { ticker: string; name: string };

export function FeatureLauncher() {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan>(null);
  const [watchlist, setWatchlist] = useState<WatchedTicker[]>([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Company[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { isSignedIn, isLoaded } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  // ── ALL hooks must be unconditional — early returns come after ──

  // Fetch plan + watchlist when opened
  useEffect(() => {
    if (!open || !isSignedIn) return;
    Promise.all([
      fetch("/api/subscription").then((r) => r.ok ? r.json() : { plan: "free" }),
      fetch("/api/watchlist").then((r) => r.ok ? r.json() : []),
    ]).then(([sub, wl]) => {
      setPlan(sub.plan ?? "free");
      setWatchlist(Array.isArray(wl) ? wl : []);
    }).catch(() => {});
  }, [open, isSignedIn]);

  // Focus search input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  // Ticker autocomplete
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setSuggestions([]); return; }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/company-search?q=${encodeURIComponent(q)}`);
        if (res.ok) setSuggestions(await res.json());
      } catch { /* noop */ }
    }, 180);
    return () => clearTimeout(id);
  }, [query]);

  // Close on outside click — exclude the toggle button to avoid mousedown/click race
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Early returns after all hooks ──

  // Hide on auth / legal pages
  if (
    !pathname ||
    pathname.startsWith("/sign-") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy")
  ) {
    return null;
  }

  if (!isLoaded) return null;

  const canAlert = plan === "pro" || plan === "research";

  const sectionLabel = "text-[9px] font-mono font-bold text-text-muted uppercase tracking-[0.12em]";
  const lockBadge    = "text-[9px] font-mono text-text-muted uppercase tracking-wider";
  const bodyText     = "text-[11px] text-text-secondary leading-relaxed";
  const bodyDim      = "text-[11px] text-text-muted leading-relaxed";

  const go = (path: string) => { setOpen(false); setQuery(""); setSuggestions([]); router.push(path); };
  const analyzeTicker = (ticker: string) => go(`/diff/${ticker.toUpperCase()}`);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); }
    if (e.key === "Escape")    { setOpen(false); }
    if (e.key === "Enter") {
      e.preventDefault();
      const pick = activeIdx >= 0 ? suggestions[activeIdx] : suggestions[0];
      if (pick) analyzeTicker(pick.ticker);
      else if (query.trim()) analyzeTicker(query.trim().split(/\s+/)[0]);
    }
  };

  return (
    <>
      {/* ── Panel ──────────────────────────────────────────── */}
      {open && (
        <div
          ref={panelRef}
          className="fixed top-11 left-2 sm:left-3 w-72 bg-bg-surface border border-bg-border rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden max-h-[calc(100vh-64px)]"
        >
          <div className="overflow-y-auto flex-1 divide-y divide-bg-border">

            {/* ① ANALYZE FILINGS */}
            <section className="px-4 py-3 space-y-2.5">
              <p className={sectionLabel}>Analyze filings</p>
              <p className={bodyText}>
                See what changed between two consecutive filings, scored by semantic novelty.
              </p>
              <div className="relative">
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setActiveIdx(-1); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ticker or company name..."
                  className="w-full h-8 px-3 bg-bg-base border border-bg-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                />
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-bg-surface border border-bg-border rounded-lg overflow-hidden z-20 shadow-xl">
                    {suggestions.slice(0, 5).map((s, i) => (
                      <button
                        key={s.ticker}
                        onMouseDown={(e) => { e.preventDefault(); analyzeTicker(s.ticker); }}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors duration-75 ${
                          i === activeIdx ? "bg-bg-raised" : "hover:bg-bg-raised"
                        }`}
                      >
                        <span className="text-xs text-text-secondary truncate">{s.name}</span>
                        <span className="font-mono text-[10px] font-semibold text-accent shrink-0">{s.ticker}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* ② GET ALERTED */}
            <section className="px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className={sectionLabel}>Get alerted</p>
                {!canAlert && <span className={lockBadge}>Pro</span>}
              </div>
              <p className={canAlert ? bodyText : bodyDim}>
                Watch tickers and get emailed when risk factors or MD&A language shifts above your threshold.
              </p>
              {isSignedIn && canAlert ? (
                <>
                  {watchlist.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {watchlist.slice(0, 8).map((item) => (
                        <button
                          key={item.ticker}
                          onClick={() => analyzeTicker(item.ticker)}
                          className="font-mono text-[10px] font-semibold px-2 py-1 rounded border border-bg-border text-text-secondary hover:border-accent hover:text-accent transition-colors"
                        >
                          {item.ticker}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className={bodyDim}>No tickers watched yet.</p>
                  )}
                  <button onClick={() => go("/watchlist")} className="text-[11px] text-text-muted hover:text-text-secondary transition-colors block">
                    Manage watchlist →
                  </button>
                </>
              ) : isSignedIn ? (
                <button onClick={() => go("/upgrade")} className="text-[11px] font-semibold text-accent hover:text-accent-bright transition-colors">
                  Upgrade to Pro →
                </button>
              ) : (
                <button onClick={() => go("/sign-in")} className="text-[11px] font-semibold text-accent hover:text-accent-bright transition-colors">
                  Sign in to watch tickers →
                </button>
              )}
            </section>

            {/* ③ ASK AI */}
            <section className="px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className={sectionLabel}>Ask AI</p>
                {!canAlert && <span className={lockBadge}>Pro</span>}
              </div>
              <p className={canAlert ? bodyText : bodyDim}>
                Ask questions about any filing, disclosure category, or language change in plain English.
              </p>
              {canAlert ? (
                <p className={bodyDim}>
                  Use the <span className="text-accent">✦</span> button in the bottom-right corner.
                </p>
              ) : (
                <>
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    Included with Pro. Get plain-English explanations of any SEC disclosure, ask follow-up questions, and understand what specific language changes actually mean.
                  </p>
                  <button onClick={() => go("/upgrade")} className="text-[11px] font-semibold text-accent hover:text-accent-bright transition-colors">
                    Upgrade to Pro for $9/mo →
                  </button>
                </>
              )}
            </section>

            {/* ④ ACCOUNT */}
            <section className="px-4 py-3 space-y-2.5">
              <p className={sectionLabel}>Account</p>
              {isSignedIn && plan !== null ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={bodyDim}>Plan:</span>
                      <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                        plan === "research" ? "border-accent/50 text-accent" :
                        plan === "pro"      ? "border-accent/50 text-accent" :
                                             "border-bg-border text-text-muted"
                      }`}>
                        {plan}
                      </span>
                    </div>
                    {plan === "free" ? (
                      <button onClick={() => go("/upgrade")} className="text-[11px] font-semibold text-accent hover:text-accent-bright transition-colors">
                        Upgrade →
                      </button>
                    ) : (
                      <button onClick={() => go("/account")} className="text-[11px] text-text-muted hover:text-text-secondary transition-colors">
                        Manage →
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <button onClick={() => go("/sign-in")} className="text-[11px] font-semibold text-accent hover:text-accent-bright transition-colors">
                  Sign in →
                </button>
              )}
            </section>

          </div>
        </div>
      )}

      {/* ── Toggle button ── */}
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        className="fixed top-2 left-2 sm:top-2.5 sm:left-3 w-8 h-8 bg-accent text-bg-base rounded-md shadow-md hover:bg-accent-bright transition-all duration-150 z-50 flex items-center justify-center text-sm font-bold select-none"
        title="Menu"
        aria-label="Open feature menu"
      >
        {open ? "✕" : "≡"}
      </button>
    </>
  );
}
