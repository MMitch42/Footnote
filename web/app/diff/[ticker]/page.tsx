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

const SECTION_LABELS: Record<string, string> = {
  item_1a: "Item 1A — Risk Factors",
  item_7: "Item 7 — MD&A",
  item_3: "Item 3 — Legal Proceedings",
};

const DIRECTION_CONFIG = {
  escalating: { pill: "bg-rose-100 text-rose-700", label: "escalating" },
  reassuring: { pill: "bg-emerald-100 text-emerald-700", label: "reassuring" },
  neutral: { pill: "bg-slate-100 text-slate-500", label: "neutral" },
};

function scoreColor(score: number | null) {
  if (!score) return "bg-slate-100 text-slate-500";
  if (score >= 8) return "bg-rose-600 text-white";
  if (score >= 5) return "bg-amber-500 text-white";
  return "bg-slate-200 text-slate-600";
}

function PassageCard({ passage }: { passage: Passage }) {
  const isHighNovelty = (passage.score ?? 0) >= 7;
  const [open, setOpen] = useState(isHighNovelty);
  const dir = passage.direction ?? "neutral";
  const dirConfig = DIRECTION_CONFIG[dir] ?? DIRECTION_CONFIG.neutral;

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        isHighNovelty ? "border-rose-200" : "border-slate-200"
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left bg-white hover:bg-slate-50 transition-colors"
      >
        <span
          className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-md ${scoreColor(passage.score)}`}
        >
          {passage.score ?? "—"}/10
        </span>
        <span
          className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md ${dirConfig.pill}`}
        >
          {dirConfig.label}
        </span>
        {passage.explanation && (
          <span className="text-sm text-slate-500 truncate hidden sm:block">
            {passage.explanation}
          </span>
        )}
        <span className="ml-auto text-slate-300 text-xs shrink-0">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div>
          {passage.old ? (
            <div className="px-5 py-4 bg-rose-50 border-t border-rose-100">
              <p className="text-xs font-semibold text-rose-400 uppercase tracking-widest mb-2">
                Removed
              </p>
              <p className="text-sm text-slate-600 leading-relaxed font-mono line-through decoration-rose-300">
                {passage.old}
              </p>
            </div>
          ) : null}

          {passage.new ? (
            <div className="px-5 py-4 bg-emerald-50 border-t border-emerald-100">
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">
                Added
              </p>
              <p className="text-sm text-slate-700 leading-relaxed font-mono">
                {passage.new}
              </p>
            </div>
          ) : null}

          {passage.explanation && (
            <div className="px-5 py-4 bg-indigo-50 border-t border-indigo-100 flex gap-3">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mt-0.5 shrink-0">
                Footnote
              </span>
              <p className="text-sm text-slate-600 leading-relaxed">
                {passage.explanation}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionBlock({ name, diff }: { name: string; diff: SectionDiff }) {
  const passages = diff.changed_passages ?? [];
  if (passages.length === 0) return null;

  const highNovelty = passages.filter((p) => (p.score ?? 0) >= 7).length;

  return (
    <section className="mb-12">
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-base font-semibold text-slate-800">
          {SECTION_LABELS[name] ?? name}
        </h2>
        <div className="h-px flex-1 bg-slate-100" />
        <span className="text-xs text-slate-400 shrink-0">
          {highNovelty} high-novelty · {Math.round(diff.change_ratio * 100)}%
          changed
        </span>
      </div>
      <div className="space-y-2.5">
        {passages.map((p, i) => (
          <PassageCard key={i} passage={p} />
        ))}
      </div>
    </section>
  );
}

export default function DiffPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = use(params);
  const [data, setData] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/alert/${ticker}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [ticker]);

  const highNoveltyTotal = data
    ? Object.values(data.sections ?? {}).flatMap((s) =>
        (s as SectionDiff).changed_passages?.filter((p) => (p.score ?? 0) >= 7)
      ).length
    : 0;

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-slate-100 sticky top-0 bg-white z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link
            href="/"
            className="text-slate-900 font-semibold tracking-tight text-lg"
          >
            Footnote
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-medium text-slate-500">{ticker}</span>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-5" />
            <p className="text-slate-600 font-medium">Analyzing {ticker}...</p>
            <p className="text-sm text-slate-400 mt-1">
              Fetching filings and scoring language changes. This may take a
              moment.
            </p>
          </div>
        )}

        {error && (
          <div className="py-20 text-center text-rose-600 text-sm">
            Failed to load: {error}
          </div>
        )}

        {data && !data.error && (
          <>
            {/* Header */}
            <div className="mb-10 pb-8 border-b border-slate-100">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                      {data.ticker}
                    </h1>
                    <span className="text-sm font-medium px-2.5 py-1 rounded-md bg-slate-100 text-slate-600">
                      {data.filing_type}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    {data.date_new} compared to {data.date_old}
                  </p>
                </div>

                {highNoveltyTotal > 0 && (
                  <div className="shrink-0 px-4 py-3 rounded-lg border border-rose-200 bg-rose-50 text-center">
                    <p className="text-2xl font-bold text-rose-700">
                      {highNoveltyTotal}
                    </p>
                    <p className="text-xs text-rose-500 font-medium">
                      high-novelty changes
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Sections */}
            {Object.entries(data.sections).map(([name, diff]) => (
              <SectionBlock
                key={name}
                name={name}
                diff={diff as SectionDiff}
              />
            ))}
          </>
        )}

        {data?.error && (
          <div className="py-20 text-center text-slate-500 text-sm">
            {data.error}
          </div>
        )}
      </div>
    </div>
  );
}
