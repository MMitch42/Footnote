"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type Passage = {
  old: string;
  new: string;
  score: number | null;
  direction: "escalating" | "reassuring" | "neutral" | null;
  explanation: string | null;
  section?: string;
};

type SectionDiff = {
  changed_passages: Passage[];
  change_ratio: number;
  unchanged_count: number;
};

type DiffResult = {
  ticker: string;
  filing_type: string;
  date_new: string;
  date_old: string;
  sections: Record<string, SectionDiff>;
  error?: string;
};

type SectionFilter = "all" | "high" | "item_1a" | "item_7" | "item_3";

const SECTION_SHORT: Record<string, string> = {
  item_1a: "1A", item_7: "7", item_3: "3",
};
const SECTION_FULL: Record<string, string> = {
  item_1a: "Item 1A — Risk Factors",
  item_7:  "Item 7 — MD&A",
  item_3:  "Item 3 — Legal Proceedings",
};

function scoreCfg(score: number | null) {
  if (!score) return null;
  if (score >= 9) return { cls: "bg-novelty-critical text-novelty-critical-text", label: "Critical" };
  if (score >= 7) return { cls: "bg-novelty-high text-novelty-high-text",         label: "High" };
  if (score >= 4) return { cls: "bg-novelty-medium text-novelty-medium-text",     label: "Notable" };
  return           { cls: "bg-novelty-low text-novelty-low-text",                 label: "Low" };
}

function ScoreBadge({ score }: { score: number | null }) {
  const cfg = scoreCfg(score);
  if (!cfg || !score) return <span className="text-xs text-text-muted">—</span>;
  return (
    <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${cfg.cls}`}>
      {score}/10 {cfg.label}
    </span>
  );
}

function shortTopic(explanation: string | null): string {
  if (!explanation) return "Language change detected";
  const words = explanation.split(" ");
  if (words.length <= 5) return explanation.replace(/\.$/, "");
  for (const sep of [" — ", ", ", " which ", " that "]) {
    const idx = explanation.indexOf(sep);
    if (idx > 0 && idx < 52) return explanation.slice(0, idx);
  }
  return words.slice(0, 5).join(" ") + "…";
}

function generateInterpretation(
  ticker: string, filingType: string, passages: Passage[], high: Passage[]
): string {
  const esc = passages.filter((p) => p.direction === "escalating").length;
  const rea = passages.filter((p) => p.direction === "reassuring").length;
  const highEsc = high.filter((p) => p.direction === "escalating").length;
  const highRea = high.filter((p) => p.direction === "reassuring").length;

  if (high.length === 0)
    return `${ticker}'s latest ${filingType} shows ${passages.length} language changes, none exceeding the high-novelty threshold. Changes appear largely administrative or cosmetic.`;
  if (highEsc > highRea * 2)
    return `${ticker}'s filing contains ${high.length} high-novelty changes, ${highEsc} of which are escalating. The language shift is predominantly risk-amplifying — new specific disclosures, removed reassurances, or acknowledged uncertainty. Warrants close reading.`;
  if (highRea > highEsc * 2)
    return `${ticker}'s filing contains ${high.length} high-novelty changes, ${highRea} of which are reassuring. The language shift suggests reduced risk acknowledgment or improved conditions versus the prior period.`;
  return `${ticker}'s filing contains ${high.length} high-novelty changes split between ${highEsc} escalating and ${highRea} reassuring (${esc} vs ${rea} overall). The mixed signal warrants reading the top findings individually.`;
}

/* ── Briefing panel ─────────────────────────────────────────── */
function BriefingPanel({
  data, passages, highPassages, onSelectPassage,
}: {
  data: DiffResult;
  passages: Passage[];
  highPassages: Passage[];
  onSelectPassage: (idx: number) => void;
}) {
  const highEsc = highPassages.filter((p) => p.direction === "escalating").length;
  const highRea = highPassages.filter((p) => p.direction === "reassuring").length;
  const topFindings = passages.slice(0, 5);

  const verdict =
    highEsc > highRea * 1.5 ? "ESCALATING" :
    highRea > highEsc * 1.5 ? "REASSURING" : "MIXED";

  const verdictColor =
    verdict === "ESCALATING" ? "text-diff-rem-text" :
    verdict === "REASSURING" ? "text-diff-add-text" : "text-text-secondary";

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">
          Analysis briefing
        </p>
        <p className="font-mono text-xs text-text-muted">
          {data.ticker} · {data.filing_type} · {data.date_old} → {data.date_new}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 rounded-lg border border-bg-border divide-x divide-bg-border overflow-hidden">
        <div className="px-4 py-3">
          <p className="font-mono text-xl font-bold text-text-primary">{passages.length}</p>
          <p className="text-[11px] text-text-muted mt-0.5">Changes</p>
        </div>
        <div className="px-4 py-3">
          <p className="font-mono text-xl font-bold text-novelty-high-text">{highPassages.length}</p>
          <p className="text-[11px] text-text-muted mt-0.5">High-novelty</p>
        </div>
        <div className="px-4 py-3">
          <p className={`font-mono text-xl font-bold ${verdictColor}`}>{verdict}</p>
          <p className="text-[11px] text-text-muted mt-0.5">Direction</p>
        </div>
      </div>

      {/* Interpretation */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Interpretation
        </p>
        <p className="text-sm text-text-secondary leading-relaxed border-l-2 border-accent/40 pl-3">
          {generateInterpretation(data.ticker, data.filing_type, passages, highPassages)}
        </p>
      </div>

      {/* Top findings */}
      {topFindings.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
            Top findings
          </p>
          <div className="space-y-3">
            {topFindings.map((p, i) => (
              <button
                key={i}
                onClick={() => onSelectPassage(i)}
                className="w-full text-left flex gap-3 items-start group"
              >
                <ScoreBadge score={p.score} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-secondary leading-snug group-hover:text-text-primary transition-colors">
                    {p.explanation}
                  </p>
                  {p.section && (
                    <p className="font-mono text-[10px] text-text-muted mt-0.5 uppercase tracking-wider">
                      {SECTION_FULL[p.section] ?? p.section}
                    </p>
                  )}
                </div>
                <span className="text-sm text-text-muted group-hover:text-accent transition-colors shrink-0 mt-0.5">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section breakdown */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
          Section breakdown
        </p>
        <div className="rounded-lg border border-bg-border divide-y divide-bg-border overflow-hidden">
          {Object.entries(data.sections).map(([key, diff]) => {
            const d = diff as SectionDiff;
            const sp = d.changed_passages ?? [];
            if (sp.length === 0) return null;
            const sEsc = sp.filter((p) => p.direction === "escalating").length;
            const sRea = sp.filter((p) => p.direction === "reassuring").length;
            const sHigh = sp.filter((p) => (p.score ?? 0) >= 7).length;
            return (
              <div key={key} className="px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-text-primary">{SECTION_FULL[key] ?? key}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {sp.length} changes · {sHigh} high-novelty · {Math.round(d.change_ratio * 100)}% of section
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {sEsc > 0 && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-diff-rem/30 text-diff-rem-text">
                      ↑ {sEsc}
                    </span>
                  )}
                  {sRea > 0 && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-diff-add/30 text-diff-add-text">
                      ↓ {sRea}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-text-muted/60">
        Click a finding above or use ↑ ↓ to browse · Esc returns here
      </p>
    </div>
  );
}

/* ── Left panel: passage row ────────────────────────────────── */
function PassageRow({
  passage, isSelected, onClick, rowRef,
}: {
  passage: Passage;
  isSelected: boolean;
  onClick: () => void;
  rowRef?: React.Ref<HTMLButtonElement>;
}) {
  const dirLabel =
    passage.direction === "escalating" ? "↑ Esc" :
    passage.direction === "reassuring" ? "↓ Rea" : null;
  const dirColor =
    passage.direction === "escalating" ? "text-diff-rem-text/70" :
    passage.direction === "reassuring" ? "text-diff-add-text/70" : "";

  return (
    <button
      ref={rowRef}
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-bg-border border-l-2 flex flex-col gap-1 transition-colors duration-100 ${
        isSelected ? "bg-bg-raised border-l-accent" : "border-l-transparent hover:bg-bg-surface"
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <ScoreBadge score={passage.score} />
        {passage.section && (
          <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
            {SECTION_SHORT[passage.section] ?? passage.section}
          </span>
        )}
        {dirLabel && (
          <span className={`text-[11px] ${dirColor}`}>{dirLabel}</span>
        )}
      </div>
      <p className={`text-xs leading-snug line-clamp-1 ${
        isSelected ? "text-text-primary" : "text-text-muted"
      }`}>
        {shortTopic(passage.explanation)}
      </p>
    </button>
  );
}

/* ── Right panel: passage detail ───────────────────────────── */
function PassageDetail({ passage, onBack }: { passage: Passage; onBack: () => void }) {
  return (
    <div>
      <div className="px-6 py-2.5 border-b border-bg-border bg-bg-base flex items-center">
        <button
          onClick={onBack}
          className="text-xs text-text-muted hover:text-accent transition-colors duration-150"
        >
          ← Overview
        </button>
      </div>
      <div className="px-6 py-5 border-b border-bg-border bg-bg-surface flex items-start justify-between gap-6">
        <p className="text-sm text-text-secondary leading-relaxed flex-1">
          {passage.explanation ?? "Language change detected."}
        </p>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <ScoreBadge score={passage.score} />
          {passage.section && (
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
              {SECTION_FULL[passage.section] ?? passage.section}
            </span>
          )}
        </div>
      </div>
      {passage.old && (
        <div className="border-b border-bg-border">
          <div className="px-6 py-2 bg-diff-rem border-b border-bg-border/50">
            <span className="text-xs font-medium text-diff-rem-text/70 uppercase tracking-wide">Removed</span>
          </div>
          <div className="px-6 py-5 bg-diff-rem/30">
            <p className="font-mono text-sm text-diff-rem-text leading-relaxed">{passage.old}</p>
          </div>
        </div>
      )}
      {passage.new && (
        <div>
          <div className="px-6 py-2 bg-diff-add border-b border-bg-border/50">
            <span className="text-xs font-medium text-diff-add-text/70 uppercase tracking-wide">Added</span>
          </div>
          <div className="px-6 py-5 bg-diff-add/30">
            <p className="font-mono text-sm text-diff-add-text leading-relaxed">{passage.new}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function DiffPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const [data, setData] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SectionFilter>("all");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const [watching, setWatching] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/alert/${ticker}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [ticker]);

  // Check if this ticker is already watched
  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => r.ok ? r.json() : [])
      .then((list: { ticker: string }[]) => {
        setWatching(list.some((i) => i.ticker === ticker.toUpperCase()));
      })
      .catch(() => {});
  }, [ticker]);

  const toggleWatch = async () => {
    setWatchLoading(true);
    try {
      if (watching) {
        await fetch(`/api/watchlist/${ticker}`, { method: "DELETE" });
        setWatching(false);
      } else {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: ticker.toUpperCase(), threshold: 7 }),
        });
        setWatching(true);
      }
    } finally {
      setWatchLoading(false);
    }
  };

  const allPassages: Passage[] = data
    ? Object.entries(data.sections)
        .flatMap(([section, diff]) =>
          (diff as SectionDiff).changed_passages.map((p) => ({ ...p, section }))
        )
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    : [];

  const highPassages = allPassages.filter((p) => (p.score ?? 0) >= 7);

  const filtered =
    filter === "all"  ? allPassages :
    filter === "high" ? highPassages :
    allPassages.filter((p) => p.section === filter);

  const selected = selectedIdx !== null ? filtered[selectedIdx] ?? null : null;

  const sectionCounts = data
    ? Object.fromEntries(
        Object.entries(data.sections).map(([k, v]) => [k, (v as SectionDiff).changed_passages.length])
      )
    : {};

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => i === null ? 0 : Math.min(i + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedIdx((i) => i === null ? 0 : Math.max(i - 1, 0)); }
      if (e.key === "Escape")    { setSelectedIdx(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered.length]);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-base">
      {/* Nav */}
      <nav className="shrink-0 border-b border-bg-border bg-bg-base">
        <div className="px-6 h-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-mono text-sm font-bold text-text-primary hover:text-accent transition-colors duration-150">
              FOOTNOTE
            </Link>
            <span className="text-text-muted">/</span>
            <span className="font-mono text-sm text-accent uppercase tracking-wider">{ticker}</span>
          </div>
          <Show when="signed-in">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleWatch}
                disabled={watchLoading}
                className={`text-xs font-medium px-3 h-7 rounded border transition-colors duration-150 disabled:opacity-50 ${
                  watching
                    ? "border-accent text-accent hover:bg-accent/10"
                    : "border-bg-border text-text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {watchLoading ? "…" : watching ? "★ Watching" : "☆ Watch"}
              </button>
              <Link href="/watchlist" className="text-xs text-text-muted hover:text-text-secondary transition-colors duration-150">
                Watchlist
              </Link>
              <UserButton appearance={{ variables: { colorPrimary: "#f59e0b" }, elements: { avatarBox: "w-7 h-7" } }} />
            </div>
          </Show>
        </div>
      </nav>

      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1 h-1 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
          <p className="text-xs text-text-muted">Analyzing {ticker}…</p>
          <p className="text-xs text-text-muted/60">First lookup ~30s · subsequent loads instant</p>
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-text-muted">{error}</p>
        </div>
      )}

      {data && !data.error && (
        <>
          {/* Filing header */}
          <div className="shrink-0 px-6 py-3 border-b border-bg-border bg-bg-surface flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-text-primary uppercase tracking-wide">{data.ticker}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-bg-border text-text-muted uppercase tracking-wider">
                {data.filing_type}
              </span>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-text-muted">{data.date_old}</span>
                <span className="text-accent">→</span>
                <span className="text-text-secondary">{data.date_new}</span>
              </div>
            </div>
            <span className="text-xs text-text-muted">
              {allPassages.length} changes · {highPassages.length} high-novelty
            </span>
          </div>

          {/* Filter bar */}
          <div className="shrink-0 border-b border-bg-border bg-bg-base flex overflow-x-auto">
            {(["all", "high", "item_1a", "item_7", "item_3"] as SectionFilter[]).map((f) => {
              const count =
                f === "all"  ? allPassages.length :
                f === "high" ? highPassages.length :
                (sectionCounts[f] ?? 0);
              if (f !== "all" && f !== "high" && count === 0) return null;
              if (f === "high" && highPassages.length === 0) return null;
              const label =
                f === "all"  ? `All (${count})` :
                f === "high" ? `High novelty (${count})` :
                `Item ${SECTION_SHORT[f]} (${count})`;
              const isActive = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setSelectedIdx(null); }}
                  className={`px-4 py-2.5 text-xs border-b-2 whitespace-nowrap transition-colors duration-100 ${
                    isActive
                      ? "border-accent text-text-primary font-medium"
                      : "border-transparent text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Two-panel layout */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: passage list */}
            <div className="w-72 shrink-0 border-r border-bg-border overflow-y-auto bg-bg-base">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-text-muted">No changes</p>
                </div>
              ) : (
                filtered.map((p, i) => (
                  <PassageRow
                    key={i}
                    passage={p}
                    isSelected={i === selectedIdx}
                    onClick={() => setSelectedIdx(i)}
                    rowRef={i === selectedIdx ? selectedRowRef : undefined}
                  />
                ))
              )}
            </div>

            {/* Right: briefing or detail */}
            <div className="flex-1 overflow-y-auto">
              {selected !== null ? (
                <PassageDetail passage={selected} onBack={() => setSelectedIdx(null)} />
              ) : (
                <BriefingPanel
                  data={data}
                  passages={allPassages}
                  highPassages={highPassages}
                  onSelectPassage={(idx) => { setFilter("all"); setSelectedIdx(idx); }}
                />
              )}
            </div>
          </div>
        </>
      )}

      {data?.error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-text-muted">{data.error}</p>
        </div>
      )}
    </div>
  );
}
