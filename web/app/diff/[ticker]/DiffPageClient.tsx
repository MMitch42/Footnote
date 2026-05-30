"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";
import { setDiffContext, subscribeNavigation, getNavigationRequest } from "@/lib/diffContext";
import { toggleFeatureLauncher } from "@/lib/featureLauncherStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/* ── Types ──────────────────────────────────────────────────── */
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

type SynthesisItem = {
  topic: string;
  section: string;
  severity: "high" | "medium" | "low";
  implication: string;
};

type Synthesis = {
  executive_summary: string;
  management_sentiment: "very_cautious" | "cautious" | "neutral" | "confident" | "very_confident";
  concerns: SynthesisItem[];
  reassurances: SynthesisItem[];
  performance_implications: string;
};

type DiffResult = {
  ticker: string;
  company_name?: string;
  filing_type: string;
  date_new: string;
  date_old: string;
  sections: Record<string, SectionDiff>;
  synthesis?: Synthesis | null;
  error?: string;
};

type SectionFilter = "all" | "high" | "item_1a" | "item_7" | "item_3";
type ActiveTab = "analysis" | "changes";

/* ── Module-level diff cache ────────────────────────────────── */
// Persists across client-side navigations within the same browser session.
// Key: ticker|form  or  ticker|form|dateNew|dateOld  (historical)
const _diffCache = new Map<string, DiffResult>();
function buildCacheKey(ticker: string, form: string, dateNew?: string | null, dateOld?: string | null) {
  return dateNew && dateOld
    ? `${ticker}|${form}|${dateNew}|${dateOld}`
    : `${ticker}|${form}`;
}

/* ── Constants ──────────────────────────────────────────────── */
const SECTION_SHORT: Record<string, string> = {
  item_1a: "1A", item_7: "7", item_3: "3",
};
const SECTION_FULL: Record<string, string> = {
  item_1a: "Item 1A: Risk Factors",
  item_7:  "Item 7: MD&A",
  item_3:  "Item 3: Legal Proceedings",
};

const SENTIMENT_LABEL: Record<string, string> = {
  very_cautious: "Very Cautious",
  cautious: "Cautious",
  neutral: "Neutral",
  confident: "Confident",
  very_confident: "Very Confident",
};
const SENTIMENT_COLOR: Record<string, string> = {
  very_cautious: "text-[#f87171]",
  cautious: "text-[#d97706]",
  neutral: "text-text-muted",
  confident: "text-diff-add-text",
  very_confident: "text-diff-add-text",
};
const SEVERITY_DOT: Record<string, string> = {
  high: "bg-[#f87171]",
  medium: "bg-accent",
  low: "bg-text-muted",
};

/* ── Helpers ────────────────────────────────────────────────── */
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

function generateFallbackSummary(
  ticker: string, filingType: string, passages: Passage[], high: Passage[]
): string {
  if (passages.length === 0)
    return `${ticker}'s ${filingType} is essentially unchanged from the prior filing. No meaningful language shifts detected.`;

  const highEsc = high.filter((p) => p.direction === "escalating").length;
  const highRea = high.filter((p) => p.direction === "reassuring").length;

  if (high.length === 0)
    return `${ticker}'s ${filingType} contains ${passages.length} detected language change${passages.length !== 1 ? "s" : ""}. None scored above the high-novelty threshold. The changes appear routine.`;
  if (highEsc > highRea * 2)
    return `${ticker}'s ${filingType} shows ${high.length} high-novelty change${high.length !== 1 ? "s" : ""}. ${highEsc} escalating vs ${highRea} reassuring. Risk language hardened more than it softened.`;
  if (highRea > highEsc * 2)
    return `${ticker}'s ${filingType} shows ${high.length} high-novelty change${high.length !== 1 ? "s" : ""}. ${highRea} reassuring vs ${highEsc} escalating. Risk language broadly softened.`;
  return `${ticker}'s ${filingType} shows ${high.length} high-novelty change${high.length !== 1 ? "s" : ""}: ${highEsc} escalating and ${highRea} reassuring across ${passages.length} total changes.`;
}

/* ── Word-level diff ─────────────────────────────────────────── */
type WordOp = { type: "keep" | "del" | "ins"; text: string };

function computeWordDiff(oldText: string, newText: string): WordOp[] | null {
  const a = oldText.trim().split(/\s+/).filter(Boolean);
  const b = newText.trim().split(/\s+/).filter(Boolean);
  if (a.length > 500 || b.length > 500) return null;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const ops: WordOp[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) { ops.unshift({ type:"keep", text:a[i-1] }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { ops.unshift({ type:"ins", text:b[j-1] }); j--; }
    else { ops.unshift({ type:"del", text:a[i-1] }); i--; }
  }
  return ops;
}

/* ── Analysis Panel ─────────────────────────────────────────── */
const CONCERNS_LIMIT = 5;
const REASSURANCES_LIMIT = 3;

function AnalysisPanel({
  data, allPassages, highPassages, plan,
  watching, watchLoading, onToggleWatch,
  onBrowseChanges, onSelectPassage,
  unscoredCount, scoringMore,
}: {
  data: DiffResult;
  allPassages: Passage[];
  highPassages: Passage[];
  plan: string;
  watching: boolean;
  watchLoading: boolean;
  onToggleWatch: () => void;
  onBrowseChanges: () => void;
  onSelectPassage: (idx: number) => void;
  unscoredCount: number;
  scoringMore: boolean;
}) {
  const [showAllConcerns, setShowAllConcerns] = useState(false);
  const [showAllReassurances, setShowAllReassurances] = useState(false);
  const synthesis = data.synthesis;
  const isPro = plan !== "free";

  const esc = allPassages.filter((p) => p.direction === "escalating").length;
  const rea = allPassages.filter((p) => p.direction === "reassuring").length;
  const verdict =
    allPassages.length === 0        ? "UNCHANGED" :
    esc > rea * 1.5                 ? "ESCALATING" :
    rea > esc * 1.5                 ? "REASSURING" : "MIXED";
  const verdictColor =
    verdict === "ESCALATING" ? "text-diff-rem-text" :
    verdict === "REASSURING" ? "text-diff-add-text" :
    verdict === "UNCHANGED"  ? "text-text-muted" :
    "text-text-secondary";

  const execSummary = synthesis?.executive_summary ||
    generateFallbackSummary(data.ticker, data.filing_type, allPassages, highPassages);

  const sentiment = synthesis?.management_sentiment ?? "neutral";
  const concerns = synthesis?.concerns ?? [];
  const reassurances = synthesis?.reassurances ?? [];
  const implications = synthesis?.performance_implications ?? "";

  // Top 5 highest-scored passages for quick navigation
  const topFindings = [...allPassages]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);

  return (
    <div className="overflow-y-auto flex-1 min-h-0">
      <div className="p-4 sm:p-6 max-w-2xl mx-auto w-full space-y-7">

        {/* Verdict + stats */}
        <div>
          <p className={`font-mono text-2xl font-bold mb-2 ${verdictColor}`}>
            {verdict}
          </p>
          <p className="font-mono text-xs text-text-muted">
            {allPassages.length} changes · {highPassages.length} high-novelty ·{" "}
            {data.filing_type} · {data.date_old} → {data.date_new}
          </p>
        </div>

        {/* Watch / upgrade CTA */}
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
            <span className="text-accent shrink-0">★</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary">Watching {data.ticker}</p>
              <p className="text-xs text-text-muted">You&apos;ll be alerted when the next {data.filing_type} drops.</p>
            </div>
            <button onClick={onToggleWatch} disabled={watchLoading}
              className="text-[11px] text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50 shrink-0">
              {watchLoading ? "…" : "Unwatch"}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-bg-border bg-bg-raised px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary mb-0.5">☆ Watch {data.ticker}</p>
                <p className="text-xs text-text-muted leading-relaxed">
                  Get emailed when the next {data.filing_type} drops.
                </p>
              </div>
              <button onClick={onToggleWatch} disabled={watchLoading}
                className="shrink-0 text-xs font-bold px-3 py-2 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors whitespace-nowrap disabled:opacity-50">
                {watchLoading ? "…" : "Watch"}
              </button>
            </div>
          </div>
        )}

        {/* Management sentiment — Pro only */}
        {isPro && synthesis && (
          <div className="flex items-center gap-3">
            <p className="text-xs text-text-muted uppercase tracking-wide font-semibold shrink-0">Management tone</p>
            <span className={`text-sm font-semibold ${SENTIMENT_COLOR[sentiment] ?? "text-text-muted"}`}>
              {SENTIMENT_LABEL[sentiment] ?? sentiment}
            </span>
          </div>
        )}

        {/* Executive summary */}
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Summary</p>
          <p className="text-sm text-text-secondary leading-relaxed border-l-2 border-accent/40 pl-3">
            {execSummary}
          </p>
        </div>

        {/* Concerns */}
        {isPro && concerns.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
              New concerns <span className="text-diff-rem-text ml-1">{concerns.length}</span>
            </p>
            <div className="space-y-3">
              {(showAllConcerns ? concerns : concerns.slice(0, CONCERNS_LIMIT)).map((c, i) => (
                <div key={i} className="flex gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${SEVERITY_DOT[c.severity] ?? "bg-text-muted"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary leading-snug">{c.topic}</p>
                    <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{c.implication}</p>
                    {c.section && (
                      <p className="font-mono text-[10px] text-text-muted/60 mt-1 uppercase tracking-wider">
                        {SECTION_FULL[c.section] ?? c.section}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {concerns.length > CONCERNS_LIMIT && (
              <button onClick={() => setShowAllConcerns((v) => !v)}
                className="mt-3 text-xs text-text-muted hover:text-text-secondary transition-colors">
                {showAllConcerns ? "Show less" : `+${concerns.length - CONCERNS_LIMIT} more`}
              </button>
            )}
          </div>
        )}

        {/* Free gate — teaser */}
        {!isPro && synthesis && (concerns.length > 0 || reassurances.length > 0) && (
          <div className="rounded-lg border border-bg-border bg-bg-surface p-4 space-y-2">
            {concerns.length > 0 && (
              <p className="text-xs text-text-muted">
                <span className="text-diff-rem-text font-semibold">{concerns.length} concern{concerns.length !== 1 ? "s" : ""}</span> identified
              </p>
            )}
            {reassurances.length > 0 && (
              <p className="text-xs text-text-muted">
                <span className="text-diff-add-text font-semibold">{reassurances.length} reassurance{reassurances.length !== 1 ? "s" : ""}</span> identified
              </p>
            )}
            <a href="/upgrade" className="inline-block text-xs font-semibold text-accent hover:text-accent-bright transition-colors mt-1">
              Read full intelligence report — Pro
            </a>
          </div>
        )}

        {/* Reassurances */}
        {isPro && reassurances.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
              Reassurances <span className="text-diff-add-text ml-1">{reassurances.length}</span>
            </p>
            <div className="space-y-3">
              {(showAllReassurances ? reassurances : reassurances.slice(0, REASSURANCES_LIMIT)).map((r, i) => (
                <div key={i} className="flex gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${SEVERITY_DOT[r.severity] ?? "bg-text-muted"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary leading-snug">{r.topic}</p>
                    <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{r.implication}</p>
                    {r.section && (
                      <p className="font-mono text-[10px] text-text-muted/60 mt-1 uppercase tracking-wider">
                        {SECTION_FULL[r.section] ?? r.section}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {reassurances.length > REASSURANCES_LIMIT && (
              <button onClick={() => setShowAllReassurances((v) => !v)}
                className="mt-3 text-xs text-text-muted hover:text-text-secondary transition-colors">
                {showAllReassurances ? "Show less" : `+${reassurances.length - REASSURANCES_LIMIT} more`}
              </button>
            )}
          </div>
        )}

        {/* Performance implications */}
        {isPro && implications && (
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Business outlook</p>
            <p className="text-sm text-text-secondary leading-relaxed border-l-2 border-bg-border pl-3">
              {implications}
            </p>
          </div>
        )}

        {/* Top findings — Pro only, quick navigation into Changes tab */}
        {isPro && topFindings.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Top findings</p>
            <div className="space-y-3">
              {topFindings.map((p, i) => (
                <button key={i} onClick={() => onSelectPassage(i)}
                  className="w-full text-left flex gap-3 items-start group">
                  <ScoreBadge score={p.score} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-secondary leading-snug group-hover:text-text-primary transition-colors">
                      {p.explanation ?? "Language change detected."}
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
        {allPassages.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Section breakdown</p>
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
                      {sEsc > 0 && <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-diff-rem/30 text-diff-rem-text">↑ {sEsc}</span>}
                      {sRea > 0 && <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-diff-add/30 text-diff-add-text">↓ {sRea}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Browse all changes */}
        {allPassages.length > 0 && (
          <button onClick={onBrowseChanges}
            className="w-full h-11 flex items-center justify-center gap-2 border border-bg-border rounded-xl text-sm font-medium text-text-primary hover:border-accent/40 hover:text-accent transition-colors">
            Browse all {allPassages.length} changes →
          </button>
        )}

        {/* Background scoring indicator */}
        {(unscoredCount > 0 || scoringMore) && (
          <div className="flex items-center gap-2 py-1">
            {scoringMore ? (
              <div className="flex gap-1">
                {[0,1,2].map((i) => (
                  <div key={i} className="w-1 h-1 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            ) : (
              <div className="w-1.5 h-1.5 rounded-full bg-text-muted/40" />
            )}
            <p className="text-xs text-text-muted">
              {scoringMore
                ? `Scoring ${unscoredCount} remaining change${unscoredCount !== 1 ? "s" : ""}…`
                : `${unscoredCount} change${unscoredCount !== 1 ? "s" : ""} not yet scored`}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

/* ── Passage row ────────────────────────────────────────────── */
function PassageRow({
  passage, isSelected, onClick, rowRef,
}: {
  passage: Passage;
  isSelected: boolean;
  onClick: () => void;
  rowRef?: React.Ref<HTMLButtonElement>;
}) {
  const dirLabel = passage.direction === "escalating" ? "↑ Esc" : passage.direction === "reassuring" ? "↓ Rea" : null;
  const dirColor = passage.direction === "escalating" ? "text-diff-rem-text/70" : passage.direction === "reassuring" ? "text-diff-add-text/70" : "";
  return (
    <button ref={rowRef} onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-bg-border border-l-2 flex flex-col gap-1 transition-colors duration-100 ${
        isSelected ? "bg-bg-raised border-l-accent" : "border-l-transparent hover:bg-bg-surface"
      }`}>
      <div className="flex items-center gap-2 flex-wrap">
        <ScoreBadge score={passage.score} />
        {passage.section && <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">{SECTION_SHORT[passage.section] ?? passage.section}</span>}
        {dirLabel && <span className={`text-[11px] ${dirColor}`}>{dirLabel}</span>}
      </div>
      <p className={`text-xs leading-snug line-clamp-1 ${isSelected ? "text-text-primary" : "text-text-muted"}`}>
        {shortTopic(passage.explanation)}
      </p>
    </button>
  );
}

/* ── Passage detail ─────────────────────────────────────────── */
function PassageDetail({ passage, onBack, isPro }: { passage: Passage; onBack: () => void; isPro: boolean }) {
  const [showWordDiff, setShowWordDiff] = useState(false);
  const wordDiffOps = useMemo(
    () => isPro && passage.old && passage.new ? computeWordDiff(passage.old, passage.new) : null,
    [isPro, passage.old, passage.new]
  );
  return (
    <div>
      <div className="px-6 py-2.5 border-b border-bg-border bg-bg-base flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-text-muted hover:text-accent transition-colors duration-150">← Back</button>
        {isPro && wordDiffOps && (
          <button onClick={() => setShowWordDiff((w) => !w)}
            className={`flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider px-2.5 py-1 rounded border transition-colors duration-150 ${
              showWordDiff ? "border-accent text-accent bg-accent/10" : "border-bg-border text-text-muted hover:border-accent hover:text-accent"
            }`}>
            {showWordDiff ? (<><span className="inline-block w-2 h-2 rounded-sm bg-diff-rem-text/70 opacity-80" /><span className="inline-block w-2 h-2 rounded-sm bg-diff-add-text/70 opacity-80 -ml-0.5" />Word diff on</>) : "Word diff"}
          </button>
        )}
      </div>
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-bg-border bg-bg-surface flex items-start justify-between gap-4">
        <p className="text-sm text-text-secondary leading-relaxed flex-1 min-w-0">
          {passage.explanation ?? "Language change detected."}
        </p>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <ScoreBadge score={passage.score} />
          {passage.section && <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider text-right">{SECTION_FULL[passage.section] ?? passage.section}</span>}
        </div>
      </div>
      {showWordDiff && wordDiffOps ? (
        <div>
          <div className="px-6 py-2 bg-bg-raised border-b border-bg-border/50 flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Inline diff</span>
            <div className="flex items-center gap-3 text-[10px] text-text-muted">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-diff-rem/60" />removed</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-diff-add/60" />added</span>
            </div>
          </div>
          <div className="px-4 sm:px-6 py-4 sm:py-5">
            <p className="font-mono text-sm leading-relaxed text-text-primary break-words">
              {wordDiffOps.map((op, idx) => {
                const sp = idx > 0 ? " " : "";
                if (op.type === "keep") return <span key={idx}>{sp}{op.text}</span>;
                if (op.type === "del") return <span key={idx}>{sp}<mark className="bg-diff-rem/50 text-diff-rem-text line-through px-0.5 rounded-sm not-italic">{op.text}</mark></span>;
                if (op.type === "ins") return <span key={idx}>{sp}<mark className="bg-diff-add/50 text-diff-add-text px-0.5 rounded-sm not-italic font-semibold">{op.text}</mark></span>;
                return null;
              })}
            </p>
          </div>
        </div>
      ) : (
        <>
          {passage.old && (
            <div className="border-b border-bg-border">
              <div className="px-4 sm:px-6 py-2 bg-diff-rem border-b border-bg-border/50">
                <span className="text-xs font-medium text-diff-rem-text/70 uppercase tracking-wide">Removed</span>
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 bg-diff-rem/30">
                <p className="font-mono text-sm text-diff-rem-text leading-relaxed break-words">{passage.old}</p>
              </div>
            </div>
          )}
          {passage.new && (
            <div>
              <div className="px-4 sm:px-6 py-2 bg-diff-add border-b border-bg-border/50">
                <span className="text-xs font-medium text-diff-add-text/70 uppercase tracking-wide">Added</span>
              </div>
              <div className="px-4 sm:px-6 py-4 sm:py-5 bg-diff-add/30">
                <p className="font-mono text-sm text-diff-add-text leading-relaxed break-words">{passage.new}</p>
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
  const typeParam = searchParams.get("type") as "10-K" | "10-Q" | null;
  const [filingType, setFilingType] = useState<"10-K" | "10-Q">(typeParam ?? "10-K");

  const [data, setData] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [slowLoad, setSlowLoad] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("analysis");
  const [filter, setFilter] = useState<SectionFilter>("all");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  const [watching, setWatching] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [plan, setPlan] = useState<"free" | "pro" | "research">("free");
  const [scoringMore, setScoringMore] = useState(false);
  // Track which diffs we've already auto-scored / recomputed so we don't loop
  const autoScoredRef = useRef<Set<string>>(new Set());
  const recomputedRef = useRef<Set<string>>(new Set());

  // Draggable split between Analysis and Changes panels (desktop only)
  const [splitPct, setSplitPct] = useState(33);
  const panelContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);

  // Fetch diff data — check module-level cache first
  useEffect(() => {
    const cacheKey = buildCacheKey(ticker, filingType, dateNew, dateOld);
    const cached = _diffCache.get(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
      // Restore context from cache so ChatWidget works on re-visit
      if (!cached.error) {
        const allP = Object.entries(cached.sections ?? {}).flatMap(([sec, diff]) =>
          (diff as SectionDiff).changed_passages.map((p) => ({ ...p, section: sec }))
        ).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        setDiffContext({
          ticker: cached.ticker,
          companyName: cached.company_name,
          filingType: cached.filing_type,
          dateNew: cached.date_new,
          dateOld: cached.date_old,
          synthesis: cached.synthesis ?? null,
          topPassages: allP.slice(0, 25).map((p) => ({
            old: p.old?.slice(0, 700) ?? "",
            new: p.new?.slice(0, 700) ?? "",
            score: p.score,
            direction: p.direction,
            explanation: p.explanation,
            section: p.section,
          })),
        });
      }
      return;
    }

    setData(null);
    setLoading(true);
    setSlowLoad(false);
    setError(null);
    setSelectedIdx(null);
    setSearchQuery("");
    setActiveTab("analysis");

    const slowTimer = setTimeout(() => setSlowLoad(true), 25_000);

    const url = isHistorical
      ? `${API_URL}/diff/${ticker}?date_new=${dateNew}&date_old=${dateOld}`
      : `${API_URL}/alert/${ticker}?form=${filingType}`;

    fetch(url, { signal: AbortSignal.timeout(120_000) })
      .then((r) => r.json())
      .then((d: DiffResult) => {
        clearTimeout(slowTimer);
        _diffCache.set(cacheKey, d);
        setData(d);
        setLoading(false);

        // Populate the shared diff context so ChatWidget can answer specific questions
        if (!d.error) {
          const allP = Object.entries(d.sections ?? {}).flatMap(([sec, diff]) =>
            (diff as SectionDiff).changed_passages.map((p) => ({ ...p, section: sec }))
          ).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

          setDiffContext({
            ticker: d.ticker,
            companyName: d.company_name,
            filingType: d.filing_type,
            dateNew: d.date_new,
            dateOld: d.date_old,
            synthesis: d.synthesis ?? null,
            // Top 25 passages — enough to answer virtually any specific question
            topPassages: allP.slice(0, 25).map((p) => ({
              old: p.old?.slice(0, 700) ?? "",
              new: p.new?.slice(0, 700) ?? "",
              score: p.score,
              direction: p.direction,
              explanation: p.explanation,
              section: p.section,
            })),
          });
        }
      })
      .catch((e) => {
        clearTimeout(slowTimer);
        const msg = e?.name === "TimeoutError"
          ? "Analysis timed out. The filing may be unusually large — try again in a moment."
          : e.message;
        setError(msg);
        setLoading(false);
      });

    return () => {
      clearTimeout(slowTimer);
      setDiffContext(null); // clear when navigating away
    };
  }, [ticker, dateNew, dateOld, isHistorical, filingType]);

  // Check watchlist + subscription
  useEffect(() => {
    Promise.all([
      fetch("/api/watchlist").then((r) => r.ok ? r.json() : []),
      fetch("/api/subscription").then((r) => r.ok ? r.json() : { plan: "free" }),
    ]).then(([list, sub]) => {
      setWatching(list.some((i: { ticker: string }) => i.ticker === ticker.toUpperCase()));
      setPlan(sub.plan ?? "free");
    }).catch(() => {});
  }, [ticker]);

  // Detect diffs cached before the cap-skipped sentinel pattern was introduced.
  // Old pipeline hard-cut at 60 passages per section with all fully scored.
  // With current pipeline, >=60 scorable passages always produces null-score sentinels —
  // so no sentinels + count >=60 in any section reliably means legacy truncation.
  const isLegacyTruncated = !loading && !!data && !data.error &&
    Object.values(data.sections ?? {}).some((diff) => {
      const passages = (diff as SectionDiff).changed_passages;
      return passages.length >= 60 &&
             !passages.some((p) => p.score === null && p.explanation === null);
    });

  // Auto-score remaining passages in the background once initial load finishes.
  // Railway completes the job regardless of frontend timeout — results are in Supabase on next fresh load.
  useEffect(() => {
    if (!data || data.error || loading || scoringMore || unscoredCount === 0) return;
    const key = buildCacheKey(data.ticker, data.filing_type, data.date_new, data.date_old);
    if (autoScoredRef.current.has(key)) return;
    autoScoredRef.current.add(key);
    const timer = setTimeout(() => scoreMore(), 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loading]);

  // Auto-recompute diffs cached by old pipeline that hard-cut at 60 passages
  // with no cap-skipped sentinels. Fires silently in the background like score-more.
  useEffect(() => {
    if (!isLegacyTruncated || !data || scoringMore) return;
    const key = buildCacheKey(data.ticker, data.filing_type, data.date_new, data.date_old);
    if (recomputedRef.current.has(key)) return;
    recomputedRef.current.add(key);
    const timer = setTimeout(() => recompute(), 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLegacyTruncated, data]);

  const switchFilingType = (type: "10-K" | "10-Q") => {
    if (type === filingType) return;
    if (type === "10-Q" && plan === "free") { router.push("/upgrade"); return; }
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
        .flatMap(([section, diff]) => (diff as SectionDiff).changed_passages.map((p) => ({ ...p, section })))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    : [];

  const highPassages = allPassages.filter((p) => (p.score ?? 0) >= 7);

  // Passages stored with null score AND null explanation = cap-skipped, not yet analyzed
  const unscoredCount = allPassages.filter((p) => p.score === null && p.explanation === null).length;

  const scoreMore = async () => {
    if (!data || scoringMore) return;
    setScoringMore(true);
    try {
      const res = await fetch("/api/score-more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: data.ticker,
          form: data.filing_type,
          date_new: data.date_new,
          date_old: data.date_old,
        }),
      });
      const updated: DiffResult = await res.json();
      if (res.ok && !updated.error) {
        // Update module cache so re-navigation hits the fresh data
        const cacheKey = buildCacheKey(data.ticker, data.filing_type, data.date_new, data.date_old);
        _diffCache.set(cacheKey, updated);
        setData(updated);

        // Refresh diffContext with newly scored passages
        const allP = Object.entries(updated.sections ?? {})
          .flatMap(([sec, diff]) =>
            (diff as SectionDiff).changed_passages.map((p) => ({ ...p, section: sec }))
          )
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        setDiffContext({
          ticker: updated.ticker,
          companyName: updated.company_name,
          filingType: updated.filing_type,
          dateNew: updated.date_new,
          dateOld: updated.date_old,
          synthesis: updated.synthesis ?? null,
          topPassages: allP.slice(0, 25).map((p) => ({
            old: p.old?.slice(0, 700) ?? "",
            new: p.new?.slice(0, 700) ?? "",
            score: p.score,
            direction: p.direction,
            explanation: p.explanation,
            section: p.section,
          })),
        });
      }
    } catch (e) {
      console.error("[score-more] failed:", e);
    } finally {
      setScoringMore(false);
    }
  };

  // Shared handler for recompute and verify — updates state with the returned diff.
  const _applyUpdatedDiff = (updated: DiffResult) => {
    const cacheKey = buildCacheKey(data!.ticker, data!.filing_type, data!.date_new, data!.date_old);
    _diffCache.set(cacheKey, updated);
    setData(updated);
    const allP = Object.entries(updated.sections ?? {})
      .flatMap(([sec, diff]) =>
        (diff as SectionDiff).changed_passages.map((p) => ({ ...p, section: sec }))
      )
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    setDiffContext({
      ticker: updated.ticker,
      companyName: updated.company_name,
      filingType: updated.filing_type,
      dateNew: updated.date_new,
      dateOld: updated.date_old,
      synthesis: updated.synthesis ?? null,
      topPassages: allP.slice(0, 25).map((p) => ({
        old: p.old?.slice(0, 700) ?? "",
        new: p.new?.slice(0, 700) ?? "",
        score: p.score,
        direction: p.direction,
        explanation: p.explanation,
        section: p.section,
      })),
    });
  };

  // Re-run the full diff for diffs that were hard-cut at 60 by old pipeline logic.
  const recompute = async () => {
    if (!data || scoringMore) return;
    setScoringMore(true);
    try {
      const res = await fetch("/api/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: data.ticker,
          form: data.filing_type,
          date_new: data.date_new,
          date_old: data.date_old,
        }),
      });
      const updated: DiffResult = await res.json();
      if (res.ok && !updated.error) _applyUpdatedDiff(updated);
    } catch (e) {
      console.error("[recompute] failed:", e);
    } finally {
      setScoringMore(false);
    }
  };

  // Verify the change count against EDGAR without burning Gemini credits.
  // Re-diffs both filings and only calls the scoring API if extra passages are found.
  const verifyCount = async () => {
    if (!data || scoringMore) return;
    setScoringMore(true);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: data.ticker, form: data.filing_type }),
      });
      const updated: DiffResult = await res.json();
      if (res.ok && !updated.error) _applyUpdatedDiff(updated);
    } catch (e) {
      console.error("[verify] failed:", e);
    } finally {
      setScoringMore(false);
    }
  };

  const filtered =
    filter === "all"  ? allPassages :
    filter === "high" ? highPassages :
    allPassages.filter((p) => p.section === filter);

  // Text search applied on top of section filter
  const searched = searchQuery.trim()
    ? filtered.filter((p) => {
        const q = searchQuery.toLowerCase();
        return (
          p.old?.toLowerCase().includes(q) ||
          p.new?.toLowerCase().includes(q) ||
          p.explanation?.toLowerCase().includes(q)
        );
      })
    : filtered;

  const selected = selectedIdx !== null ? searched[selectedIdx] ?? null : null;

  const sectionCounts = data
    ? Object.fromEntries(Object.entries(data.sections).map(([k, v]) => [k, (v as SectionDiff).changed_passages.length]))
    : {};

  // Keyboard navigation (only active on Changes tab)
  useEffect(() => {
    if (activeTab !== "changes") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => i === null ? 0 : Math.min(i + 1, searched.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedIdx((i) => i === null ? 0 : Math.max(i - 1, 0)); }
      if (e.key === "Escape")    { setSelectedIdx(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searched.length, activeTab]);

  useEffect(() => { selectedRowRef.current?.scrollIntoView({ block: "nearest" }); }, [selectedIdx]);

  // Navigate to a passage when ChatWidget fires a navigation request
  useEffect(() => {
    return subscribeNavigation(() => {
      const idx = getNavigationRequest();
      if (idx === null || !data) return;
      setActiveTab("changes");
      setFilter("all");
      setSearchQuery("");
      setSelectedIdx(idx);
    });
  }, [data]);

  // Opening a passage from Analysis tab switches to Changes tab
  const selectPassageFromAnalysis = (idx: number) => {
    setActiveTab("changes");
    setFilter("all");
    setSelectedIdx(idx);
  };

  const handleSplitMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplit.current = true;
    const onMove = (e: MouseEvent) => {
      if (!isDraggingSplit.current || !panelContainerRef.current) return;
      const rect = panelContainerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(60, Math.max(20, pct)));
    };
    const onUp = () => {
      isDraggingSplit.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const companyDisplay = data?.company_name && data.company_name !== ticker.toUpperCase()
    ? `${data.company_name} (${data.ticker})`
    : (data?.ticker ?? ticker.toUpperCase());

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-base">

      {/* Nav */}
      <nav className="shrink-0 border-b border-bg-border bg-bg-base">
        <div className="px-6 h-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              data-launcher-trigger="true"
              onClick={toggleFeatureLauncher}
              className="w-7 h-7 bg-accent text-bg-base rounded flex items-center justify-center text-sm font-bold hover:bg-accent-bright transition-colors shrink-0"
              title="Menu"
              aria-label="Open menu"
            >
              ≡
            </button>
            <Link href="/" className="font-mono text-sm font-bold text-text-primary hover:text-accent transition-colors duration-150">
              FOOTNOTE
            </Link>
            <span className="text-text-muted">/</span>
            <span className="font-mono text-sm text-accent uppercase tracking-wider truncate max-w-[100px] sm:max-w-[180px]">
              {data?.company_name && data.company_name !== ticker.toUpperCase()
                ? data.company_name
                : ticker.toUpperCase()}
            </span>
          </div>
          <Show when="signed-in">
            <div className="flex items-center gap-4">
              <button onClick={toggleWatch} disabled={watchLoading}
                className={`text-xs font-medium px-3 h-7 rounded border transition-colors duration-150 disabled:opacity-50 ${
                  watching ? "border-accent text-accent hover:bg-accent/10" : "border-bg-border text-text-muted hover:border-accent hover:text-accent"
                }`}>
                {watchLoading ? "…" : watching ? "★ Watching" : "☆ Watch"}
              </button>
              {/* Re-run diff from EDGAR — lets users verify the change count is complete */}
              {data && !data.error && !loading && (
                <button
                  onClick={verifyCount}
                  disabled={scoringMore}
                  title="Re-diff from EDGAR to verify the change count is complete. Free if nothing changed — only scores if new passages are found."
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors duration-150 disabled:opacity-40 hidden sm:block"
                >
                  {scoringMore ? "…" : "↺ Refresh"}
                </button>
              )}
              <Link href="/watchlist" className="hidden sm:block text-xs text-text-secondary hover:text-text-primary transition-colors duration-150">Watchlist</Link>
              {plan === "free" && (
                <a href="/upgrade" className="text-xs font-semibold px-3 h-7 flex items-center bg-accent text-bg-base rounded hover:bg-accent-bright transition-colors duration-150 whitespace-nowrap">
                  Get Pro →
                </a>
              )}
              <UserButton appearance={{ variables: { colorPrimary: "#f59e0b" }, elements: { avatarBox: "w-7 h-7" } }} />
            </div>
          </Show>
          <Show when="signed-out">
            <div className="flex items-center gap-3">
              <a href="/sign-in" className="text-xs text-text-muted hover:text-text-secondary transition-colors duration-150">Sign in</a>
              <a href="/sign-up" className="text-xs font-medium px-3 h-7 flex items-center bg-accent text-bg-base rounded hover:bg-accent-bright transition-colors duration-150">Get alerts</a>
            </div>
          </Show>
        </div>
      </nav>

      {loading && (
        <>
          {/* Skeleton tab bar — mobile only */}
          <div className="md:hidden shrink-0 border-b border-bg-border bg-bg-base flex">
            <div className="px-4 py-2.5 border-b-2 border-accent flex items-center">
              <div className="h-2.5 w-14 bg-bg-raised rounded animate-pulse" />
            </div>
            <div className="px-4 py-2.5 flex items-center opacity-40">
              <div className="h-2.5 w-20 bg-bg-raised rounded animate-pulse" />
            </div>
          </div>

          {/* Skeleton content — mirrors real three-column layout */}
          <div className="flex flex-1 overflow-hidden">

            {/* Analysis skeleton — full width mobile, 1/3 left column desktop */}
            <div className="flex flex-col flex-1 md:flex-none md:w-1/3 md:border-r md:border-bg-border overflow-y-auto">
              <div className="p-4 sm:p-6 space-y-7">

                {/* Verdict + stats */}
                <div className="space-y-2 pt-1">
                  <div className="h-7 w-40 bg-bg-surface rounded animate-pulse" />
                  <div className="h-3 w-72 bg-bg-surface rounded animate-pulse opacity-60" />
                </div>

                {/* Watch CTA */}
                <div className="rounded-lg border border-bg-border bg-bg-raised p-4 flex items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="h-3.5 w-36 bg-bg-surface rounded animate-pulse" />
                    <div className="h-3 w-56 bg-bg-surface rounded animate-pulse opacity-60" />
                  </div>
                  <div className="h-8 w-20 bg-bg-surface rounded-lg animate-pulse shrink-0" />
                </div>

                {/* Sentiment */}
                <div className="flex items-center gap-3">
                  <div className="h-3 w-28 bg-bg-surface rounded animate-pulse opacity-60" />
                  <div className="h-3 w-20 bg-bg-surface rounded animate-pulse" />
                </div>

                {/* Summary */}
                <div className="space-y-2">
                  <div className="h-3 w-16 bg-bg-surface rounded animate-pulse opacity-60" />
                  <div className="pl-3 border-l-2 border-bg-border space-y-2">
                    <div className="h-3 w-full bg-bg-surface rounded animate-pulse" />
                    <div className="h-3 w-11/12 bg-bg-surface rounded animate-pulse" />
                    <div className="h-3 w-4/5 bg-bg-surface rounded animate-pulse" />
                    <div className="h-3 w-2/3 bg-bg-surface rounded animate-pulse opacity-60" />
                  </div>
                </div>

                {/* Concerns */}
                <div className="space-y-3">
                  <div className="h-3 w-24 bg-bg-surface rounded animate-pulse opacity-60" />
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3" style={{ opacity: 1 - i * 0.18 }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-bg-surface shrink-0 mt-1.5 animate-pulse" />
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="h-3 bg-bg-surface rounded animate-pulse" style={{ width: `${72 - i * 8}%` }} />
                        <div className="h-2.5 w-full bg-bg-surface rounded animate-pulse opacity-50" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reassurances */}
                <div className="space-y-3">
                  <div className="h-3 w-28 bg-bg-surface rounded animate-pulse opacity-60" />
                  {[0, 1].map((i) => (
                    <div key={i} className="flex gap-3" style={{ opacity: 1 - i * 0.3 }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-bg-surface shrink-0 mt-1.5 animate-pulse" />
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="h-3 bg-bg-surface rounded animate-pulse" style={{ width: `${65 - i * 10}%` }} />
                        <div className="h-2.5 w-full bg-bg-surface rounded animate-pulse opacity-50" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Status message */}
                <div className="flex items-center gap-2 pt-2">
                  <div className="flex gap-1">
                    {[0,1,2].map((i) => (
                      <div key={i} className="w-1 h-1 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                  <p className="text-xs text-text-muted">
                    {slowLoad
                      ? "Still working — large filings can take up to a minute on first analysis."
                      : `Analyzing ${ticker.toUpperCase()}… first run ~20–30s, subsequent loads instant.`}
                  </p>
                </div>

              </div>
            </div>

            {/* Right skeleton — desktop only */}
            <div className="hidden md:flex flex-1 flex-col">
              {/* Filter bar skeleton */}
              <div className="shrink-0 border-b border-bg-border bg-bg-base flex items-center gap-4 px-4 py-2.5">
                {[40, 32, 44, 40, 40].map((w, i) => (
                  <div key={i} className="h-3 bg-bg-surface rounded animate-pulse" style={{ width: w, opacity: i === 0 ? 1 : 0.4 }} />
                ))}
              </div>
              {/* Passage list + detail */}
              <div className="flex flex-1 overflow-hidden">
                {/* Passage list skeleton */}
                <div className="w-64 shrink-0 border-r border-bg-border overflow-y-auto">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div key={i} className="px-3 py-2.5 border-b border-bg-border flex flex-col gap-1.5" style={{ opacity: 1 - i * 0.09 }}>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-bg-surface animate-pulse shrink-0" />
                        <div className="h-3 w-14 bg-bg-surface rounded animate-pulse" />
                      </div>
                      <div className="h-2.5 bg-bg-surface rounded animate-pulse opacity-50" style={{ width: `${78 - i * 5}%` }} />
                    </div>
                  ))}
                </div>
                {/* Passage detail placeholder */}
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xs text-text-muted">Select a change to view details</p>
                </div>
              </div>
            </div>

          </div>
        </>
      )}

      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm font-semibold text-text-primary">Could not load filing data</p>
          <p className="text-xs text-text-muted max-w-sm leading-relaxed">The analysis service may be temporarily unavailable. Check back in a moment.</p>
          <button onClick={() => window.history.back()} className="text-xs font-semibold px-4 py-2 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors">Go back</button>
        </div>
      )}

      {data && !data.error && (
        <>
          {/* Filing header */}
          <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-bg-border bg-bg-surface flex items-center gap-3 overflow-x-auto">
            <span className="text-sm font-semibold text-text-primary shrink-0">{companyDisplay}</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-bg-border text-text-muted uppercase tracking-wider shrink-0">{data.filing_type}</span>
            <div className="flex items-center gap-2 font-mono text-xs shrink-0">
              <span className="text-text-muted">{data.date_old}</span>
              <span className="text-accent">→</span>
              <span className="text-text-secondary">{data.date_new}</span>
            </div>
            {/* Filing type toggle — only for standard domestic filers (10-K/10-Q); foreign filers use 20-F/6-K */}
            {!isHistorical && (data.filing_type === "10-K" || data.filing_type === "10-Q") && (
              <div className="ml-auto flex items-center gap-1 shrink-0">
                {(["10-K", "10-Q"] as const).map((t) => (
                  <button key={t} onClick={() => switchFilingType(t)}
                    title={t === "10-Q" && plan === "free" ? "10-Q diffs require Pro" : undefined}
                    className={`font-mono text-[10px] px-2 py-1 rounded border uppercase tracking-wider transition-colors duration-150 ${
                      filingType === t ? "border-accent text-accent bg-accent/10" :
                      t === "10-Q" && plan === "free" ? "border-transparent text-text-muted/50 hover:text-accent hover:border-accent/40" :
                      "border-transparent text-text-muted hover:text-text-secondary"
                    }`}>
                    {t}{t === "10-Q" && plan === "free" && <span className="ml-1 text-[8px] font-bold text-accent/70 uppercase">Pro</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Alert banner for free users */}
          {plan === "free" && (() => {
            const daysAgo = Math.floor((Date.now() - new Date(data.date_new).getTime()) / (1000 * 60 * 60 * 24));
            if (daysAgo < 1) return null;
            return (
              <div className="shrink-0 px-4 py-2 bg-accent/8 border-b border-accent/20 flex items-center justify-between gap-4 flex-wrap">
                <p className="text-xs text-text-secondary leading-relaxed">
                  <span className="text-accent font-semibold">Pro subscribers were alerted {daysAgo} day{daysAgo !== 1 ? "s" : ""} ago</span>
                  {highPassages.length > 0 ? ` — ${highPassages.length} high-novelty change${highPassages.length !== 1 ? "s" : ""} flagged.` : "."}
                </p>
                <a href="/upgrade" className="shrink-0 text-xs font-semibold px-3 py-1.5 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors whitespace-nowrap">
                  Get Pro for $9/mo
                </a>
              </div>
            );
          })()}

          {/* Tab bar — mobile only; desktop shows both panels side-by-side */}
          <div className="md:hidden shrink-0 border-b border-bg-border bg-bg-base flex">
            <button onClick={() => setActiveTab("analysis")}
              className={`px-4 py-2.5 text-xs border-b-2 whitespace-nowrap transition-colors duration-100 ${
                activeTab === "analysis" ? "border-accent text-text-primary font-medium" : "border-transparent text-text-muted hover:text-text-secondary"
              }`}>
              Analysis
            </button>
            <button onClick={() => { setActiveTab("changes"); setSelectedIdx(null); }}
              className={`px-4 py-2.5 text-xs border-b-2 whitespace-nowrap transition-colors duration-100 ${
                activeTab === "changes" ? "border-accent text-text-primary font-medium" : "border-transparent text-text-muted hover:text-text-secondary"
              }`}>
              Changes · {allPassages.length}
            </button>
          </div>

          {/* Content — side-by-side on desktop, tabbed on mobile */}
          <div ref={panelContainerRef} className="flex flex-1 overflow-hidden">

            {/* Left: Analysis panel — always visible on desktop, tab-gated on mobile */}
            <div
              className={`md:border-r md:border-bg-border ${
                activeTab === "analysis"
                  ? "flex flex-col flex-1 md:flex-none"
                  : "hidden md:flex md:flex-col md:flex-none"
              }`}
              style={{ width: `${splitPct}%` }}
            >
              <AnalysisPanel
                data={data}
                allPassages={allPassages}
                highPassages={highPassages}
                plan={plan}
                watching={watching}
                watchLoading={watchLoading}
                onToggleWatch={toggleWatch}
                onBrowseChanges={() => { setActiveTab("changes"); setSelectedIdx(null); }}
                onSelectPassage={selectPassageFromAnalysis}
                unscoredCount={unscoredCount}
                scoringMore={scoringMore}
              />
            </div>

            {/* Drag divider — desktop only */}
            <div
              onMouseDown={handleSplitMouseDown}
              className="hidden md:flex w-1 shrink-0 cursor-col-resize items-center justify-center group hover:bg-accent/20 transition-colors duration-100 z-10"
              title="Drag to resize"
            >
              <div className="w-px h-full bg-bg-border group-hover:bg-accent/40 transition-colors" />
            </div>

            {/* Right: Changes panel — always visible on desktop, tab-gated on mobile */}
            <div className={`flex-1 overflow-hidden ${activeTab === "changes" ? "flex flex-col" : "hidden md:flex md:flex-col"}`}>

              {/* Filter bar */}
              <div className="shrink-0 border-b border-bg-border bg-bg-base flex items-stretch">
                {/* Section filter pills — scrollable */}
                <div className="flex overflow-x-auto flex-1 min-w-0">
                  {(["all", "high", "item_1a", "item_7", "item_3"] as SectionFilter[]).map((f) => {
                    const count = f === "all" ? allPassages.length : f === "high" ? highPassages.length : (sectionCounts[f] ?? 0);
                    if (f !== "all" && f !== "high" && count === 0) return null;
                    if (f === "high" && highPassages.length === 0) return null;
                    const label = f === "all" ? `All (${count})` : f === "high" ? `High (${count})` : `Item ${SECTION_SHORT[f]} (${count})`;
                    return (
                      <button key={f} onClick={() => { setFilter(f); setSelectedIdx(null); }}
                        className={`px-4 py-2.5 text-xs border-b-2 whitespace-nowrap transition-colors duration-100 ${
                          filter === f ? "border-accent text-text-primary font-medium" : "border-transparent text-text-muted hover:text-text-secondary"
                        }`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                {/* Scoring progress — only shown while work is in flight */}
                {scoringMore && (
                  <div className="shrink-0 flex items-center px-3 border-l border-bg-border gap-1.5">
                    <div className="flex gap-0.5">
                      {[0,1,2].map((i) => (
                        <div key={i} className="w-1 h-1 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </div>
                    <span className="text-[10px] text-text-muted whitespace-nowrap">
                      {unscoredCount > 0 ? `Scoring ${unscoredCount} more…` : "Checking…"}
                    </span>
                  </div>
                )}
                {/* Search input — always visible */}
                <div className="shrink-0 flex items-center px-2 border-l border-bg-border">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setSelectedIdx(null); }}
                    placeholder="Search…"
                    className="w-24 sm:w-32 h-6 px-2 text-xs bg-bg-surface border border-bg-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 transition-colors"
                  />
                </div>
              </div>

              {/* Passage list + detail */}
              <div className="flex flex-1 overflow-hidden">
                {/* Passage list */}
                <div className={`overflow-y-auto bg-bg-base md:w-64 md:shrink-0 md:border-r md:border-bg-border ${
                  selected !== null ? "hidden md:block" : "flex-1 md:flex-none"
                }`}>
                  {searched.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-xs text-text-muted">
                        {searchQuery ? `No changes matching "${searchQuery}"` : "No changes"}
                      </p>
                    </div>
                  ) : (
                    searched.map((p, i) => (
                      <PassageRow key={i} passage={p} isSelected={i === selectedIdx}
                        onClick={() => setSelectedIdx(i)}
                        rowRef={i === selectedIdx ? selectedRowRef : undefined}
                      />
                    ))
                  )}
                </div>

                {/* Passage detail */}
                <div className={`overflow-y-auto md:flex-1 ${selected !== null ? "flex-1" : "hidden md:flex md:items-center md:justify-center"}`}>
                  {selected !== null ? (
                    <PassageDetail
                      key={selectedIdx ?? 0}
                      passage={selected}
                      onBack={() => setSelectedIdx(null)}
                      isPro={plan !== "free"} />
                  ) : (
                    <p className="text-xs text-text-muted text-center px-4">
                      Select a change to view details · ↑ ↓ to navigate
                    </p>
                  )}
                </div>
              </div>

            </div>
          </div>
        </>
      )}

      {data?.error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm font-semibold text-text-primary">No filings found for {ticker}</p>
          <p className="text-xs text-text-muted max-w-sm leading-relaxed">
            {data.error.includes("fewer than 2")
              ? `${ticker} doesn't have at least two comparable filings on SEC EDGAR. Foreign companies (e.g. Chinese ADRs) file 20-F instead of 10-K — we try both automatically, but ${ticker} may have too few filings or list under a different ticker.`
              : data.error}
          </p>
          <button onClick={() => window.history.back()} className="text-xs font-semibold px-4 py-2 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors">Go back</button>
        </div>
      )}

      {/* Disclaimer — always visible; layout.tsx's global one is clipped by h-screen overflow-hidden */}
      <div className="shrink-0 px-6 py-1.5 text-center">
        <p className="text-[10px] text-text-muted/50">Not financial advice. For informational purposes only.</p>
      </div>
    </div>
  );
}
