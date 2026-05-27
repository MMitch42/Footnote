"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
type MobileView = "overview" | "list";

const SECTION_SHORT: Record<string, string> = {
  item_1a: "1A", item_7: "7", item_3: "3",
};
const SECTION_FULL: Record<string, string> = {
  item_1a: "Item 1A: Risk Factors",
  item_7:  "Item 7: MD&A",
  item_3:  "Item 3: Legal Proceedings",
};

function scoreCfg(score: number | null) {
  if (!score) return null;
  if (score >= 9) return { dot: "bg-[#f87171]", text: "text-[#f87171]", label: "Critical" };
  if (score >= 7) return { dot: "bg-accent",    text: "text-accent",    label: "High" };
  if (score >= 4) return { dot: "bg-[#d97706]", text: "text-[#d97706]", label: "Notable" };
  return           { dot: "bg-text-muted",   text: "text-text-muted",  label: "Low" };
}

function ScoreBadge({ score }: { score: number | null }) {
  const cfg = scoreCfg(score);
  if (!cfg || !score) return <span className="font-mono text-xs text-text-muted">?</span>;
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      <span className={`font-mono text-xs font-semibold tabular-nums ${cfg.text}`}>{score}/10</span>
    </div>
  );
}

function shortTopic(explanation: string | null): string {
  if (!explanation) return "Language change detected";
  const words = explanation.split(" ");
  if (words.length <= 5) return explanation.replace(/\.$/, "");
  for (const sep of [": ", ", ", " which ", " that "]) {
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
    return `${ticker}'s ${filingType} contains ${passages.length} detected language change${passages.length !== 1 ? "s" : ""}. None scored above the high-novelty threshold (7+). The changes may be routine updates or minor rewording.`;
  if (highEsc > highRea * 2)
    return `${ticker}'s ${filingType} contains ${high.length} high-novelty change${high.length !== 1 ? "s" : ""}: ${highEsc} scored as escalating and ${highRea} as reassuring. More language shifted toward added risk disclosure than away from it. Read the individual findings below to judge significance.`;
  if (highRea > highEsc * 2)
    return `${ticker}'s ${filingType} contains ${high.length} high-novelty change${high.length !== 1 ? "s" : ""}: ${highRea} scored as reassuring and ${highEsc} as escalating. More language shifted away from risk disclosure than toward it. Read the individual findings below to judge significance.`;
  return `${ticker}'s ${filingType} contains ${high.length} high-novelty change${high.length !== 1 ? "s" : ""}: ${highEsc} escalating and ${highRea} reassuring (${esc} vs ${rea} across all changes). The direction is mixed. Read the individual findings below.`;
}

/* ── Word-level diff ─────────────────────────────────────────── */
type WordOp = { type: "keep" | "del" | "ins"; text: string };

function computeWordDiff(oldText: string, newText: string): WordOp[] | null {
  const a = oldText.trim().split(/\s+/).filter(Boolean);
  const b = newText.trim().split(/\s+/).filter(Boolean);
  if (a.length > 500 || b.length > 500) return null;

  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops: WordOp[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ type: "keep", text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: "ins", text: b[j - 1] });
      j--;
    } else {
      ops.unshift({ type: "del", text: a[i - 1] });
      i--;
    }
  }
  return ops;
}

/* ── Briefing panel ─────────────────────────────────────────── */
function BriefingPanel({
  data, passages, highPassages, totalPassages, onSelectPassage, onShowList,
  plan, watching, watchLoading, onToggleWatch,
}: {
  data: DiffResult;
  passages: Passage[];
  highPassages: Passage[];
  totalPassages: number;
  onSelectPassage: (idx: number) => void;
  onShowList: () => void;
  plan: string;
  watching: boolean;
  watchLoading: boolean;
  onToggleWatch: () => void;
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
          AI Analysis
        </p>
        <p className="font-mono text-xs text-text-muted">
          {data.ticker} · {data.filing_type} · {data.date_old} → {data.date_new}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 rounded-lg border border-bg-border divide-x divide-bg-border overflow-hidden">
        <div className="px-4 py-3">
          <p className="font-mono text-xl font-bold text-text-primary">{passages.length}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">Changes</p>
        </div>
        <div className="px-4 py-3">
          <p className="font-mono text-xl font-bold text-accent">{highPassages.length}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">High-novelty</p>
        </div>
        <div className="px-4 py-3">
          <p className={`font-mono text-xl font-bold ${verdictColor}`}>{verdict}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">Direction</p>
        </div>
      </div>

      {/* Watch CTA */}
      {plan === "free" ? (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary mb-0.5">Get alerted next time</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Know when the next {data.filing_type} drops before most investors notice.
              </p>
            </div>
            <a
              href="/upgrade"
              className="shrink-0 text-xs font-bold px-3 py-2 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors whitespace-nowrap"
            >
              Get Pro · $9/mo
            </a>
          </div>
        </div>
      ) : watching ? (
        <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 flex items-center gap-3">
          <span className="text-accent text-lg shrink-0">★</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">Watching {data.ticker}</p>
            <p className="text-xs text-text-muted">
              You&apos;ll be alerted when the next {data.filing_type} drops.
            </p>
          </div>
          <button
            onClick={onToggleWatch}
            disabled={watchLoading}
            className="text-[11px] text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50 shrink-0"
          >
            {watchLoading ? "…" : "Unwatch"}
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-bg-border bg-bg-raised px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary mb-0.5">☆ Watch {data.ticker}</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Get emailed the moment the next {data.filing_type} drops.
              </p>
            </div>
            <button
              onClick={onToggleWatch}
              disabled={watchLoading}
              className="shrink-0 text-xs font-bold px-3 py-2 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {watchLoading ? "…" : "Watch →"}
            </button>
          </div>
        </div>
      )}

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

      {/* Mobile: view all changes CTA */}
      {totalPassages > 0 && (
        <button
          onClick={onShowList}
          className="md:hidden w-full h-11 flex items-center justify-center gap-2 border border-bg-border rounded-xl text-sm font-medium text-text-primary hover:border-accent/40 hover:text-accent transition-colors"
        >
          Browse all {totalPassages} changes →
        </button>
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
                  <p className="text-xs text-text-secondary mt-0.5">
                    {sp.length} changes · {sHigh} high-novelty · {Math.min(Math.round(d.change_ratio * 100), 100)}% of section
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

      <p className="hidden md:block text-xs text-text-muted">
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
function PassageDetail({
  passage, onBack, isPro,
}: {
  passage: Passage;
  onBack: () => void;
  isPro: boolean;
}) {
  const [showWordDiff, setShowWordDiff] = useState(false);

  const wordDiffOps = useMemo(
    () =>
      isPro && passage.old && passage.new
        ? computeWordDiff(passage.old, passage.new)
        : null,
    [isPro, passage.old, passage.new]
  );

  const hasWordDiff = wordDiffOps !== null;

  return (
    <div>
      {/* Header bar */}
      <div className="px-6 py-2.5 border-b border-bg-border bg-bg-base flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-xs text-text-muted hover:text-accent transition-colors duration-150"
        >
          ← Back
        </button>
        {isPro && hasWordDiff && (
          <button
            onClick={() => setShowWordDiff((w) => !w)}
            className={`flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider px-2.5 py-1 rounded border transition-colors duration-150 ${
              showWordDiff
                ? "border-accent text-accent bg-accent/10"
                : "border-bg-border text-text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {showWordDiff ? (
              <>
                <span className="inline-block w-2 h-2 rounded-sm bg-diff-rem-text/70 opacity-80" />
                <span className="inline-block w-2 h-2 rounded-sm bg-diff-add-text/70 opacity-80 -ml-0.5" />
                Word diff on
              </>
            ) : (
              <>Word diff</>
            )}
          </button>
        )}
      </div>

      {/* Explanation + score */}
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

      {showWordDiff && wordDiffOps ? (
        <div>
          <div className="px-6 py-2 bg-bg-raised border-b border-bg-border/50 flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Inline diff</span>
            <div className="flex items-center gap-3 text-[10px] text-text-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-diff-rem/60" />
                removed
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-diff-add/60" />
                added
              </span>
            </div>
          </div>
          <div className="px-6 py-5">
            <p className="font-mono text-sm leading-relaxed text-text-primary">
              {wordDiffOps.map((op, idx) => {
                const sp = idx > 0 ? " " : "";
                if (op.type === "keep") return <span key={idx}>{sp}{op.text}</span>;
                if (op.type === "del") return (
                  <span key={idx}>
                    {sp}
                    <mark className="bg-diff-rem/50 text-diff-rem-text line-through px-0.5 rounded-sm not-italic">
                      {op.text}
                    </mark>
                  </span>
                );
                if (op.type === "ins") return (
                  <span key={idx}>
                    {sp}
                    <mark className="bg-diff-add/50 text-diff-add-text px-0.5 rounded-sm not-italic font-semibold">
                      {op.text}
                    </mark>
                  </span>
                );
                return null;
              })}
            </p>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export function DiffPageClient({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateNew = searchParams.get("date_new");
  const dateOld = searchParams.get("date_old");
  const isHistorical = !!(dateNew && dateOld);

  // Filing type toggle (non-historical mode only)
  const typeParam = searchParams.get("type") as "10-K" | "10-Q" | null;
  const [filingType, setFilingType] = useState<"10-K" | "10-Q">(typeParam ?? "10-K");

  const [data, setData] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SectionFilter>("all");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const [watching, setWatching] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [plan, setPlan] = useState<"free" | "pro" | "research">("free");

  // Mobile layout state
  const [mobileView, setMobileView] = useState<MobileView>("overview");
  // Remember which panel we came from when opening a detail
  const [prevMobileView, setPrevMobileView] = useState<MobileView>("overview");

  // Fetch diff data
  useEffect(() => {
    setData(null);
    setLoading(true);
    setError(null);
    setSelectedIdx(null);
    setMobileView("overview");

    const url = isHistorical
      ? `${API_URL}/diff/${ticker}?date_new=${dateNew}&date_old=${dateOld}`
      : `${API_URL}/alert/${ticker}?filing_type=${filingType}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [ticker, dateNew, dateOld, isHistorical, filingType]);

  // Check watchlist status + subscription
  useEffect(() => {
    Promise.all([
      fetch("/api/watchlist").then((r) => r.ok ? r.json() : []),
      fetch("/api/subscription").then((r) => r.ok ? r.json() : { plan: "free" }),
    ]).then(([list, sub]) => {
      setWatching(list.some((i: { ticker: string }) => i.ticker === ticker.toUpperCase()));
      setPlan(sub.plan ?? "free");
    }).catch(() => {});
  }, [ticker]);

  const switchFilingType = (type: "10-K" | "10-Q") => {
    if (type === filingType) return;
    setFilingType(type);
    router.replace(`/diff/${ticker}?type=${type}`, { scroll: false });
  };

  const toggleWatch = async () => {
    if (plan === "free") { router.push("/upgrade"); return; }
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

  // Keyboard navigation
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

  // Select a passage (captures mobile context)
  const selectPassage = (idx: number, fromView: MobileView = mobileView) => {
    setPrevMobileView(fromView);
    setSelectedIdx(idx);
  };

  // Mobile layout visibility
  const listVisible = mobileView === "list" && selectedIdx === null;
  const rightVisible = !listVisible; // overview or detail

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-base">
      {/* Nav */}
      <nav className="shrink-0 border-b border-bg-border bg-bg-base">
        <div className="px-6 h-10 flex items-center justify-between">
          <div className="flex items-center gap-3 ml-10">
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
              {plan === "research" && (
                <Link
                  href={`/history/${ticker}`}
                  className="hidden sm:block text-xs text-text-secondary hover:text-text-primary transition-colors duration-150"
                >
                  History
                </Link>
              )}
              <Link href="/watchlist" className="hidden sm:block text-xs text-text-secondary hover:text-text-primary transition-colors duration-150">
                Watchlist
              </Link>
              {plan === "free" && (
                <a
                  href="/upgrade"
                  className="text-xs font-semibold px-3 h-7 flex items-center bg-accent text-bg-base rounded hover:bg-accent-bright transition-colors duration-150 whitespace-nowrap"
                >
                  Get Pro →
                </a>
              )}
              <UserButton appearance={{ variables: { colorPrimary: "#f59e0b" }, elements: { avatarBox: "w-7 h-7" } }} />
            </div>
          </Show>
          <Show when="signed-out">
            <div className="flex items-center gap-3">
              <a href="/sign-in" className="text-xs text-text-muted hover:text-text-secondary transition-colors duration-150">
                Sign in
              </a>
              <a
                href="/sign-up"
                className="text-xs font-medium px-3 h-7 flex items-center bg-accent text-bg-base rounded hover:bg-accent-bright transition-colors duration-150"
              >
                Get alerts →
              </a>
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
          <p className="text-xs text-text-muted">Analyzing {ticker.toUpperCase()}…</p>
          <p className="text-xs text-text-muted">First lookup ~30s · subsequent loads instant</p>
        </div>
      )}

      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm font-semibold text-text-primary">Could not load filing data</p>
          <p className="text-xs text-text-muted max-w-sm leading-relaxed">
            The analysis service may be temporarily unavailable. Check back in a moment.
          </p>
          <button
            onClick={() => window.history.back()}
            className="text-xs font-semibold px-4 py-2 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors"
          >
            Go back
          </button>
        </div>
      )}

      {data && !data.error && (
        <>
          {/* Filing header */}
          <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-bg-border bg-bg-surface flex items-center gap-3 overflow-x-auto">
            {isHistorical && (
              <Link
                href={`/history/${ticker}`}
                className="text-xs text-text-muted hover:text-accent transition-colors duration-150 shrink-0 mr-1"
              >
                ← History
              </Link>
            )}
            <span className="font-mono text-sm font-bold text-text-primary uppercase tracking-wide shrink-0">{data.ticker}</span>
            {/* Filing type toggle */}
            {!isHistorical && (
              <div className="flex items-center gap-1 shrink-0">
                {(["10-K", "10-Q"] as const).map((ft) => (
                  <button
                    key={ft}
                    onClick={() => switchFilingType(ft)}
                    className={`font-mono text-[10px] px-2 py-1 rounded border uppercase tracking-wider transition-colors duration-150 ${
                      filingType === ft
                        ? "border-accent text-accent bg-accent/10"
                        : "border-bg-border text-text-muted hover:border-accent/50 hover:text-text-secondary"
                    }`}
                  >
                    {ft}
                  </button>
                ))}
              </div>
            )}
            {isHistorical && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-bg-border text-text-muted uppercase tracking-wider shrink-0">
                {data.filing_type}
              </span>
            )}
            <div className="flex items-center gap-2 font-mono text-xs shrink-0">
              <span className="text-text-muted">{data.date_old}</span>
              <span className="text-accent">→</span>
              <span className="text-text-secondary">{data.date_new}</span>
            </div>
            <span className="hidden sm:block text-xs text-text-secondary ml-auto shrink-0">
              {allPassages.length} changes · {highPassages.length} high-novelty
            </span>
          </div>

          {/* Alert banner for free users */}
          {plan === "free" && (() => {
            const daysAgo = Math.floor((Date.now() - new Date(data.date_new).getTime()) / (1000 * 60 * 60 * 24));
            if (daysAgo < 1) return null;
            const urgentChanges = highPassages.length;
            return (
              <div className="shrink-0 px-4 py-2.5 bg-accent/8 border-b border-accent/20 flex items-center justify-between gap-4 flex-wrap">
                <p className="text-xs text-text-secondary leading-relaxed">
                  <span className="text-accent font-semibold">Pro subscribers were alerted {daysAgo} day{daysAgo !== 1 ? "s" : ""} ago</span>
                  {urgentChanges > 0
                    ? ` with ${urgentChanges} high-novelty change${urgentChanges !== 1 ? "s" : ""} flagged.`
                    : ` when this ${data.filing_type} dropped.`}
                </p>
                <a
                  href="/upgrade"
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors whitespace-nowrap"
                >
                  Get Pro for $9/mo →
                </a>
              </div>
            );
          })()}

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
                f === "high" ? `High (${count})` :
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

          {/* Two-panel layout — responsive */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: passage list */}
            <div className={`overflow-y-auto bg-bg-base md:w-72 md:shrink-0 md:border-r md:border-bg-border md:block ${listVisible ? "flex-1" : "hidden"}`}>
              {/* Mobile header: back to overview */}
              <div className="md:hidden flex items-center px-4 py-2.5 border-b border-bg-border bg-bg-surface gap-3">
                <button
                  onClick={() => setMobileView("overview")}
                  className="text-xs font-medium text-accent"
                >
                  ← Overview
                </button>
                <span className="font-mono text-[10px] text-text-muted ml-auto">
                  {filtered.length} passages
                </span>
              </div>
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
                    onClick={() => selectPassage(i, "list")}
                    rowRef={i === selectedIdx ? selectedRowRef : undefined}
                  />
                ))
              )}
            </div>

            {/* Right: briefing or detail */}
            <div className={`overflow-y-auto md:flex-1 md:block ${rightVisible ? "flex-1" : "hidden"}`}>
              {selected !== null ? (
                <PassageDetail
                  key={selectedIdx ?? 0}
                  passage={selected}
                  onBack={() => {
                    setSelectedIdx(null);
                    setMobileView(prevMobileView);
                  }}
                  isPro={plan !== "free"}
                />
              ) : (
                <BriefingPanel
                  data={data}
                  passages={allPassages}
                  highPassages={highPassages}
                  totalPassages={allPassages.length}
                  onSelectPassage={(idx) => {
                    selectPassage(idx, "overview");
                    setFilter("all");
                  }}
                  onShowList={() => setMobileView("list")}
                  plan={plan}
                  watching={watching}
                  watchLoading={watchLoading}
                  onToggleWatch={toggleWatch}
                />
              )}
            </div>
          </div>
        </>
      )}

      {data?.error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm font-semibold text-text-primary">No filings found for {ticker}</p>
          <p className="text-xs text-text-muted max-w-sm leading-relaxed">
            {data.error.includes("fewer than 2")
              ? `${ticker} doesn't have enough filings on SEC EDGAR to generate a diff. This usually means the company recently went public or filed under a different ticker.`
              : data.error}
          </p>
          <button
            onClick={() => window.history.back()}
            className="text-xs font-semibold px-4 py-2 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors"
          >
            Go back
          </button>
        </div>
      )}
    </div>
  );
}
