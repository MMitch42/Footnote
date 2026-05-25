"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type Passage = {
  old: string;
  new: string;
  score: number | null;
  direction: "escalating" | "reassuring" | "neutral" | null;
  explanation: string | null;
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

type Filter = "all" | "escalating" | "reassuring";

const SECTION_LABELS: Record<string, string> = {
  item_1a: "Item 1A — Risk Factors",
  item_7: "Item 7 — MD&A",
  item_3: "Item 3 — Legal Proceedings",
};

function ScoreIndicator({ score }: { score: number | null }) {
  if (!score) return <span className="text-xs text-slate-300 tabular-nums w-10 text-right">—</span>;
  const color = score >= 8 ? "text-red-700 font-bold" : score >= 5 ? "text-amber-600 font-semibold" : "text-slate-400";
  return <span className={`text-xs tabular-nums w-10 text-right ${color}`}>{score}/10</span>;
}

function DirectionDot({ direction }: { direction: Passage["direction"] }) {
  if (!direction || direction === "neutral") return <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0 mt-0.5" />;
  if (direction === "escalating") return <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-0.5" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-0.5" />;
}

const TRUNCATE_CHARS = 320;

function TruncatedText({ text, className, strikethrough }: { text: string; className?: string; strikethrough?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > TRUNCATE_CHARS;
  const displayed = !isLong || expanded ? text : text.slice(0, TRUNCATE_CHARS).trimEnd() + "…";
  return (
    <div>
      <p className={`text-sm leading-relaxed font-mono ${strikethrough ? "line-through decoration-red-300" : ""} ${className ?? ""}`}>
        {displayed}
      </p>
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="mt-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2"
        >
          {expanded ? "Show less" : "Read full passage →"}
        </button>
      )}
    </div>
  );
}

function PassageCard({ passage, defaultOpen = false }: { passage: Passage; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 transition-colors group"
      >
        <DirectionDot direction={passage.direction} />
        <span className="flex-1 text-sm text-slate-600 leading-snug line-clamp-2">
          {passage.explanation ?? "Language change detected."}
        </span>
        <ScoreIndicator score={passage.score} />
        <span className="text-slate-300 text-xs shrink-0 mt-0.5 group-hover:text-slate-500 transition-colors">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {/* Analysis shown first — this is the Footnote */}
          {passage.explanation && (
            <div className="px-4 py-3 bg-slate-50 flex gap-2.5 items-start">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest shrink-0 mt-0.5 w-16">
                Analysis
              </span>
              <p className="text-sm text-slate-700 leading-relaxed">{passage.explanation}</p>
            </div>
          )}
          {passage.old && (
            <div className="px-4 py-3 bg-red-50 border-l-4 border-l-red-400">
              <p className="text-xs font-medium text-red-400 uppercase tracking-widest mb-1.5">Removed</p>
              <TruncatedText text={passage.old} className="text-slate-500" strikethrough />
            </div>
          )}
          {passage.new && (
            <div className="px-4 py-3 bg-emerald-50 border-l-4 border-l-emerald-500">
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-widest mb-1.5">Added</p>
              <TruncatedText text={passage.new} className="text-slate-700" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionBlock({ name, diff, filter }: { name: string; diff: SectionDiff; filter: Filter }) {
  const [showAll, setShowAll] = useState(false);
  const passages = diff.changed_passages ?? [];

  const filtered =
    filter === "escalating" ? passages.filter((p) => p.direction === "escalating") :
    filter === "reassuring" ? passages.filter((p) => p.direction === "reassuring") :
    passages;

  const displayed = showAll ? filtered : filtered.slice(0, 8);
  const highNovelty = passages.filter((p) => (p.score ?? 0) >= 7).length;

  if (passages.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">{SECTION_LABELS[name] ?? name}</h2>
        <div className="h-px flex-1 bg-slate-100" />
        <span className="text-xs text-slate-400">
          {highNovelty} high-novelty · {Math.round(diff.change_ratio * 100)}% changed
        </span>
      </div>
      <div className="space-y-1.5">
        {displayed.map((p, i) => <PassageCard key={i} passage={p} defaultOpen={false} />)}
      </div>
      {filtered.length > 8 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 w-full py-2 text-xs text-slate-400 font-medium border border-slate-200 rounded-md hover:bg-slate-50 hover:text-slate-600 transition-colors"
        >
          Show {filtered.length - 8} more
        </button>
      )}
    </div>
  );
}

export default function DiffPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const [data, setData] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>("top");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    fetch(`${API_URL}/alert/${ticker}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [ticker]);

  const allPassages = data
    ? Object.entries(data.sections).flatMap(([name, diff]) =>
        ((diff as SectionDiff).changed_passages ?? []).map((p) => ({ ...p, section: name }))
      )
    : [];

  const topPassages = [...allPassages]
    .filter((p) => (p.score ?? 0) >= 7)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);

  const sectionKeys = data ? Object.keys(data.sections) : [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center gap-3">
          <Link href="/" className="text-sm font-semibold text-slate-800 hover:text-slate-600 transition-colors">
            Footnote
          </Link>
          <span className="text-slate-300 text-sm">/</span>
          <span className="text-sm text-slate-500">{ticker}</span>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-slate-500">Analyzing {ticker}...</p>
          </div>
        )}

        {error && <div className="py-20 text-center text-red-500 text-sm">Failed to load: {error}</div>}

        {data && !data.error && (
          <>
            {/* Header */}
            <div className="bg-white border border-slate-200 rounded-lg px-6 py-5 mb-6 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-0.5">
                  <h1 className="text-xl font-bold text-slate-900">{data.ticker}</h1>
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                    {data.filing_type}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{data.date_new} vs {data.date_old}</p>
              </div>
              {topPassages.length > 0 && (
                <div className="text-right">
                  <p className="text-2xl font-bold text-red-700">{topPassages.length}</p>
                  <p className="text-xs text-slate-400">high-novelty changes</p>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-0.5 mb-5 bg-white border border-slate-200 rounded-lg p-1 w-fit">
              <button
                onClick={() => setActiveSection("top")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeSection === "top" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Top findings
              </button>
              {sectionKeys.map((key) => {
                const count = (data.sections[key] as SectionDiff).changed_passages?.length ?? 0;
                if (count === 0) return null;
                return (
                  <button
                    key={key}
                    onClick={() => { setActiveSection(key); setFilter("all"); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                      activeSection === key ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {SECTION_LABELS[key]?.split("—")[0].trim()}
                    <span className={`text-xs px-1 rounded ${activeSection === key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Top findings */}
            {activeSection === "top" && (
              <div className="space-y-1.5">
                {topPassages.length === 0 ? (
                  <p className="text-sm text-slate-400 py-8 text-center">No high-novelty changes found.</p>
                ) : (
                  topPassages.map((p, i) => (
                    <div key={i}>
                      <p className="text-xs text-slate-400 mb-1 ml-0.5">
                        {SECTION_LABELS[p.section] ?? p.section}
                      </p>
                      <PassageCard passage={p} defaultOpen={i === 0} />
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Section view */}
            {activeSection !== "top" && data.sections[activeSection] && (
              <div>
                {/* Filter bar */}
                <div className="flex items-center gap-1.5 mb-4">
                  {(["all", "escalating", "reassuring"] as Filter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                        filter === f ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                <SectionBlock
                  name={activeSection}
                  diff={data.sections[activeSection] as SectionDiff}
                  filter={filter}
                />
              </div>
            )}
          </>
        )}

        {data?.error && (
          <div className="py-20 text-center text-slate-400 text-sm">{data.error}</div>
        )}
      </div>
    </div>
  );
}
