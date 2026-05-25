"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEMO = {
  ticker: "BA",
  dateNew: "Jan 30, 2026",
  dateOld: "Feb 3, 2025",
  section: "Item 1A — Risk Factors",
  score: 10,
  direction: "escalating" as const,
  explanation:
    "Boeing replaced generic program-risk boilerplate with specific disclosure of 777X and 737-7/737-10 certification delays, explicitly acknowledging ongoing FAA process uncertainty — a material escalation for investors.",
  old: "The commercial aircraft business is extremely complex, involving extensive coordination and integration with suppliers, highly-skilled labor performed by thousands of employees of ours and other partners, and stringent and evolving regulatory requirements and performance and reliability standards.",
  new: "The introduction of new aircraft programs and/or derivatives, such as the 777X, 737-7 and 737-10, takes years and involves significant risks associated with meeting development, testing, certification, and production schedules. We follow the lead of the FAA as we work through the certification process, and we have experienced, and may continue to experience, significant delays.",
};

export default function Home() {
  const [ticker, setTicker] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (t) router.push(`/diff/${t}`);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-slate-900 font-semibold tracking-tight text-lg">
            Footnote
          </span>
          <a
            href="mailto:mitchell.magid@gmail.com?subject=Footnote early access"
            className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Request access →
          </a>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6">
        {/* Hero */}
        <div className="pt-20 pb-16 max-w-3xl">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            <span className="text-xs font-medium text-indigo-700 tracking-wide">
              Based on Cohen, Malloy & Nguyen · Journal of Finance, 2020
            </span>
          </div>

          <h1 className="text-5xl font-bold text-slate-900 leading-[1.1] tracking-tight mb-5">
            Know when a company quietly changes what it tells investors.
          </h1>

          <p className="text-lg text-slate-500 leading-relaxed mb-10 max-w-2xl">
            Footnote diffs consecutive SEC 10-K and 10-Q filings, then scores
            every language change for semantic materiality. Get emailed the day
            it happens — not weeks later.
          </p>

          <form onSubmit={handleSearch} className="flex gap-2.5 max-w-lg">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="Enter a ticker — AAPL, BA, TSLA"
              className="flex-1 px-4 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
            >
              Analyze filing
            </button>
          </form>
        </div>

        {/* Demo */}
        <div className="mb-20">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
            Live example
          </p>

          <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            {/* Filing header */}
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-800">
                  {DEMO.ticker}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-sm text-slate-500">
                  {DEMO.dateNew} vs {DEMO.dateOld}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-sm text-slate-500">{DEMO.section}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-1 rounded-md bg-rose-100 text-rose-700">
                  escalating
                </span>
                <span className="text-xs font-bold px-2 py-1 rounded-md bg-rose-600 text-white">
                  {DEMO.score}/10
                </span>
              </div>
            </div>

            {/* Removed */}
            <div className="px-5 py-4 bg-rose-50 border-b border-rose-100">
              <p className="text-xs font-semibold text-rose-400 uppercase tracking-widest mb-2">
                2025 — Removed
              </p>
              <p className="text-sm text-slate-600 leading-relaxed font-mono line-through decoration-rose-300">
                {DEMO.old}
              </p>
            </div>

            {/* Added */}
            <div className="px-5 py-4 bg-emerald-50 border-b border-emerald-100">
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">
                2026 — Added
              </p>
              <p className="text-sm text-slate-700 leading-relaxed font-mono">
                {DEMO.new}
              </p>
            </div>

            {/* Explanation */}
            <div className="px-5 py-4 bg-indigo-50 flex gap-3">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mt-0.5 shrink-0">
                Footnote
              </span>
              <p className="text-sm text-slate-600 leading-relaxed">
                {DEMO.explanation}
              </p>
            </div>
          </div>
        </div>

        {/* Pricing callout */}
        <div className="border-t border-slate-100 py-14 flex items-start justify-between gap-12">
          <div className="max-w-lg">
            <p className="text-sm text-slate-400 mb-2">
              Institutional research platforms charge up to $15,000/year for
              this signal.
            </p>
            <p className="text-2xl font-bold text-slate-900 leading-snug">
              Footnote delivers it at{" "}
              <span className="text-indigo-600">$29/month.</span>
            </p>
          </div>
          <div className="shrink-0 flex flex-col gap-2 text-right">
            <a
              href="mailto:mitchell.magid@gmail.com?subject=Footnote early access"
              className="inline-block px-6 py-3 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
            >
              Get early access
            </a>
            <p className="text-xs text-slate-400">
              No credit card required.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
