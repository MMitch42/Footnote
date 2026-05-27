"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type TimelinePoint = {
  date_new: string;
  date_old: string;
  max_score: number;
  avg_score: number;
  n_changes: number;
  change_ratio: number;
};

type JobStatus = "pending" | "running" | "complete" | "error";

/* ── Score color helpers ──────────────────────────────────────── */
function scoreColor(score: number): string {
  if (score >= 9) return "#f87171";
  if (score >= 7) return "#f59e0b";
  if (score >= 4) return "#d97706";
  return "#6b7280";
}

function scoreDot(score: number): string {
  if (score >= 9) return "bg-[#f87171]";
  if (score >= 7) return "bg-accent";
  if (score >= 4) return "bg-[#d97706]";
  return "bg-text-muted";
}

function scoreLabel(score: number): string {
  if (score >= 9) return "Critical";
  if (score >= 7) return "High";
  if (score >= 4) return "Notable";
  return "Low";
}

/* ── SVG Timeline Chart ───────────────────────────────────────── */
function TimelineChart({
  data,
  onSelect,
  selected,
}: {
  data: TimelinePoint[];
  onSelect: (idx: number) => void;
  selected: number | null;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Single point — render a minimal dot chart with a message
  if (data.length === 1) {
    const d = data[0];
    return (
      <div className="flex items-center gap-4 py-4">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          d.max_score >= 9 ? "bg-[#f87171]" : d.max_score >= 7 ? "bg-accent" : "bg-[#d97706]"
        }`} />
        <p className="text-xs text-text-muted">
          One filing pair on record ({d.date_old} → {d.date_new}, score {d.max_score}/10). Load full history below to populate the timeline.
        </p>
      </div>
    );
  }

  const W = 600;
  const H = 160;
  const PAD = { left: 36, right: 16, top: 20, bottom: 32 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const xs = data.map((_, i) => PAD.left + (i / (data.length - 1)) * cW);
  const ys = data.map((d) => PAD.top + cH - (d.max_score / 10) * cH);

  const linePath = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${ys[i]}`).join(" ");

  // Y gridlines at 0, 5, 10
  const gridLines = [0, 5, 10].map((v) => ({
    y: PAD.top + cH - (v / 10) * cH,
    label: String(v),
  }));

  const active = hovered ?? selected;

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 160 }}
      >
        {/* Grid */}
        {gridLines.map(({ y, label }) => (
          <g key={label}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#1f2937" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4} fontSize={9} fill="#6b7280" textAnchor="end">
              {label}
            </text>
          </g>
        ))}

        {/* Line */}
        <path d={linePath} fill="none" stroke="#374151" strokeWidth={1.5} />

        {/* Points */}
        {data.map((d, i) => (
          <g key={i}>
            {/* Hit area */}
            <circle
              cx={xs[i]}
              cy={ys[i]}
              r={12}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect(i)}
            />
            {/* Visual dot */}
            <circle
              cx={xs[i]}
              cy={ys[i]}
              r={i === active ? 5 : 3.5}
              fill={scoreColor(d.max_score)}
              stroke={i === active ? "#0a0a0a" : "none"}
              strokeWidth={2}
              className="transition-all duration-100 pointer-events-none"
            />
          </g>
        ))}

        {/* X axis labels — show year only, skip if crowded */}
        {data.map((d, i) => {
          const year = d.date_new.slice(0, 4);
          const prevYear = i > 0 ? data[i - 1].date_new.slice(0, 4) : null;
          if (prevYear === year) return null;
          return (
            <text
              key={i}
              x={xs[i]}
              y={H - 6}
              fontSize={9}
              fill="#6b7280"
              textAnchor="middle"
            >
              {year}
            </text>
          );
        })}

        {/* Tooltip */}
        {active !== null && (() => {
          const d = data[active];
          const x = xs[active];
          const y = ys[active];
          const flip = x > W * 0.7;
          const tx = flip ? x - 8 : x + 8;
          const anchor = flip ? "end" : "start";
          return (
            <g pointerEvents="none">
              <rect
                x={flip ? tx - 88 : tx}
                y={y - 26}
                width={88}
                height={44}
                rx={4}
                fill="#111827"
                stroke="#1f2937"
                strokeWidth={1}
              />
              <text x={flip ? tx - 44 : tx + 44} y={y - 11} fontSize={9} fill="#9ca3af" textAnchor="middle">
                {d.date_new}
              </text>
              <text x={flip ? tx - 44 : tx + 44} y={y + 3} fontSize={11} fill={scoreColor(d.max_score)} fontWeight="bold" textAnchor="middle">
                {d.max_score}/10
              </text>
              <text x={flip ? tx - 44 : tx + 44} y={y + 15} fontSize={9} fill="#6b7280" textAnchor="middle">
                {d.n_changes} changes
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function HistoryPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const router = useRouter();

  const [plan, setPlan] = useState<"free" | "pro" | "research" | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [form, setForm] = useState<"10-K" | "10-Q">("10-K");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check subscription
  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => r.ok ? r.json() : { plan: "free" })
      .then((d) => setPlan(d.plan ?? "free"))
      .catch(() => setPlan("free"));
  }, []);

  // Redirect non-Research users
  useEffect(() => {
    if (plan !== null && plan !== "research") {
      router.replace("/upgrade");
    }
  }, [plan, router]);

  // Load timeline
  const loadTimeline = useCallback(() => {
    setTimelineLoading(true);
    fetch(`${API_URL}/timeline/${ticker}?form=${form}`)
      .then((r) => r.json())
      .then((d) => {
        setTimeline(Array.isArray(d) ? d : []);
        setTimelineLoading(false);
      })
      .catch(() => setTimelineLoading(false));
  }, [ticker, form]);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  // Poll job status
  const pollJob = useCallback((id: string) => {
    fetch(`${API_URL}/job/${id}`)
      .then((r) => r.json())
      .then((d) => {
        const status = d.status as JobStatus;
        setJobStatus(status);
        if (status === "complete") {
          setJobId(null);
          loadTimeline();
        } else if (status === "error") {
          setJobError(d.result?.error ?? "Backfill failed. Try again.");
          setJobId(null);
        } else {
          // Still running — poll again
          pollRef.current = setTimeout(() => pollJob(id), 3000);
        }
      })
      .catch(() => {
        pollRef.current = setTimeout(() => pollJob(id), 5000);
      });
  }, [loadTimeline]);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const triggerBackfill = async () => {
    setJobError(null);
    setJobStatus("pending");
    try {
      const res = await fetch(`${API_URL}/historical/${ticker}?form=${form}&n=20`, { method: "POST" });
      const d = await res.json();
      if (d.job_id) {
        setJobId(d.job_id);
        pollRef.current = setTimeout(() => pollJob(d.job_id), 3000);
      } else {
        setJobError("Failed to start backfill.");
        setJobStatus(null);
      }
    } catch {
      setJobError("Could not reach the analysis service.");
      setJobStatus(null);
    }
  };

  const isBackfilling = jobStatus === "pending" || jobStatus === "running";

  if (plan === null) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1 h-1 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      {/* Nav */}
      <nav className="shrink-0 border-b border-bg-border bg-bg-base">
        <div className="px-6 h-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-mono text-sm font-bold text-text-primary hover:text-accent transition-colors duration-150">
              FOOTNOTE
            </Link>
            <span className="text-text-muted">/</span>
            <Link
              href={`/diff/${ticker}`}
              className="font-mono text-sm text-accent uppercase tracking-wider hover:text-accent-bright transition-colors"
            >
              {ticker}
            </Link>
            <span className="text-text-muted">/</span>
            <span className="font-mono text-sm text-text-secondary">History</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/watchlist" className="text-xs text-text-secondary hover:text-text-primary transition-colors duration-150">
              Watchlist
            </Link>
            <UserButton appearance={{ variables: { colorPrimary: "#f59e0b" }, elements: { avatarBox: "w-7 h-7" } }} />
          </div>
        </div>
      </nav>

      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-lg font-bold text-text-primary tracking-wide">
              {ticker.toUpperCase()} Filing History
            </h1>
            <p className="text-xs text-text-muted mt-1">
              Novelty score over time. Click any point to view that diff.
            </p>
          </div>

          {/* Form toggle */}
          <div className="flex rounded-lg border border-bg-border overflow-hidden text-xs font-mono">
            {(["10-K", "10-Q"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setForm(f); setTimeline([]); setSelected(null); }}
                className={`px-3 py-1.5 transition-colors duration-100 ${
                  form === f
                    ? "bg-accent text-bg-base font-semibold"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Backfill state or chart */}
        {timelineLoading ? (
          <div className="flex items-center gap-2 py-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1 h-1 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
            <span className="text-xs text-text-muted ml-1">Loading history…</span>
          </div>
        ) : timeline.length === 0 ? (
          <div className="rounded-xl border border-bg-border bg-bg-surface p-8 flex flex-col items-center text-center gap-4">
            <p className="text-sm font-semibold text-text-primary">No history loaded yet</p>
            <p className="text-xs text-text-muted max-w-sm leading-relaxed">
              Load the last 10+ years of {ticker} {form} filings and compute novelty scores for each consecutive pair. Takes 1–3 minutes.
            </p>
            {jobError && (
              <p className="text-xs text-[#f87171]">{jobError}</p>
            )}
            {isBackfilling ? (
              <div className="flex items-center gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1 h-1 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
                <span className="text-xs text-text-muted">Fetching and scoring filings…</span>
              </div>
            ) : (
              <button
                onClick={triggerBackfill}
                className="text-xs font-semibold px-5 py-2.5 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors"
              >
                Load full history →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Chart */}
            <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
              <p className="text-[10px] font-mono text-text-muted uppercase tracking-widest mb-3">
                Max novelty score · {form} · {ticker}
              </p>
              <TimelineChart
                data={timeline}
                onSelect={setSelected}
                selected={selected}
              />
            </div>

            {/* Load more banner when history looks incomplete */}
            {timeline.length < 5 && !isBackfilling && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-text-primary">
                    Only {timeline.length} filing pair{timeline.length !== 1 ? "s" : ""} loaded
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Load the full history to see {ticker.toUpperCase()}&apos;s complete timeline. Up to 10+ years of consecutive diffs.
                  </p>
                </div>
                <button
                  onClick={triggerBackfill}
                  className="shrink-0 text-xs font-semibold px-4 py-2 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors whitespace-nowrap"
                >
                  Load full history →
                </button>
              </div>
            )}

            {/* Status row */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-muted">
                {timeline.length} filing pair{timeline.length !== 1 ? "s" : ""}
              </p>
              {isBackfilling ? (
                <div className="flex items-center gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-1 h-1 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                  <span className="text-xs text-text-muted">Fetching and scoring filings…</span>
                </div>
              ) : timeline.length >= 5 && (
                <button
                  onClick={triggerBackfill}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  Refresh
                </button>
              )}
            </div>

            {/* Filing pair list */}
            <div className="rounded-xl border border-bg-border overflow-hidden">
              <div className="px-4 py-2.5 bg-bg-surface border-b border-bg-border grid grid-cols-[1fr_80px_72px_72px] gap-4">
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Period</span>
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider text-right">Score</span>
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider text-right">Changes</span>
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider text-right">Δ Text</span>
              </div>
              {[...timeline].reverse().map((point, i) => {
                const globalIdx = timeline.length - 1 - i;
                const isSelected = selected === globalIdx;
                return (
                  <Link
                    key={i}
                    href={`/diff/${ticker}?date_new=${point.date_new}&date_old=${point.date_old}`}
                    onClick={() => setSelected(globalIdx)}
                    className={`grid grid-cols-[1fr_80px_72px_72px] gap-4 px-4 py-3 border-b border-bg-border last:border-b-0 hover:bg-bg-raised transition-colors duration-100 ${
                      isSelected ? "bg-bg-raised" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${scoreDot(point.max_score)}`} />
                      <span className="font-mono text-xs text-text-secondary">
                        {point.date_old}
                      </span>
                      <span className="text-accent text-xs">→</span>
                      <span className="font-mono text-xs text-text-primary">
                        {point.date_new}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="font-mono text-xs font-semibold" style={{ color: scoreColor(point.max_score) }}>
                        {point.max_score}/10
                      </span>
                      <span className="text-[10px] text-text-muted">{scoreLabel(point.max_score)}</span>
                    </div>
                    <span className="font-mono text-xs text-text-muted text-right self-center">
                      {point.n_changes}
                    </span>
                    <span className="font-mono text-xs text-text-muted text-right self-center">
                      {Math.min(Math.round(point.change_ratio * 100), 100)}%
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
