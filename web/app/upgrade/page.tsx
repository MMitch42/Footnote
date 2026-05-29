"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

type Feature = { label: string; detail?: string };

const FREE_FEATURES: Feature[] = [
  { label: "Latest 10-K diff for any public company" },
  { label: "Novelty scores on every changed passage (1–10)" },
  { label: "Risk Factors, MD&A, and Legal Proceedings" },
  { label: "Overview summary" },
  { label: "Watchlist: up to 2 tickers" },
];

const PRO_FEATURES: Feature[] = [
  { label: "Everything in Free" },
  {
    label: "Footnote AI",
    detail: "Ask anything about the diff in plain English. Find topic-specific changes, explain language shifts, search across all passages at once.",
  },
  {
    label: "Full intelligence report",
    detail: "Concerns, reassurances, management sentiment, and business outlook synthesized from every change in the filing.",
  },
  {
    label: "10-Q quarterly diffs + word-level view",
    detail: "Track quarterly filings, not just annual 10-Ks. Inline word diff shows what changed within a passage.",
  },
  { label: "Unlimited watchlist" },
  { label: "Email alerts when filings change (adjustable threshold)" },
  { label: "Weekly digest across your watchlist" },
];

type Plan = "free" | "pro" | "research" | null;

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>(null);
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/subscription")
      .then((r) => r.ok ? r.json() : { plan: "free" })
      .then((d) => setPlan(d.plan ?? "free"))
      .catch(() => setPlan("free"));
  }, [isSignedIn]);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "pro" }),
      });
      const data = await res.json();
      if (data.url) {
        router.push(data.url);
      } else {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
      }
    } catch {
      setError("Could not start checkout. Try again.");
      setLoading(false);
    }
  };

  const alreadyPro = plan === "pro" || plan === "research";

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      {/* Nav */}
      <nav className="border-b border-bg-border">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          <Link href="/" className="font-mono text-sm font-bold text-text-primary hover:text-accent transition-colors ml-10">
            FOOTNOTE
          </Link>
          <button onClick={() => router.back()} className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            Back
          </button>
        </div>
      </nav>

      <div className="flex-1 px-6 py-16 max-w-5xl mx-auto w-full">

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-mono text-3xl font-bold text-text-primary mb-3">Plans</h1>
          <p className="text-sm text-text-secondary max-w-md mx-auto">
            Institutional research platforms charge $15,000/year for this signal. We don&apos;t.
          </p>
        </div>

        {/* Pricing grid — 2 columns, centered */}
        <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">

          {/* Free */}
          <div className="rounded-xl border border-bg-border bg-bg-surface p-6 flex flex-col gap-5">
            <p className="font-mono text-xs text-text-muted uppercase tracking-widest">Free</p>

            <div>
              <div className="flex items-end gap-1.5 mb-1">
                <span className="font-mono text-4xl font-bold text-text-primary">$0</span>
              </div>
              <p className="text-xs text-text-muted">Free forever. No credit card.</p>
            </div>

            <Link
              href="/"
              className="w-full h-10 flex items-center justify-center border border-bg-border text-sm text-text-secondary rounded-lg hover:border-accent/40 hover:text-text-primary transition-colors"
            >
              Start for free
            </Link>

            <ul className="space-y-2.5">
              {FREE_FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-2.5">
                  <span className="text-text-muted text-sm shrink-0 mt-0.5">✓</span>
                  <span className="text-sm text-text-secondary leading-snug">{f.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro */}
          <div className="rounded-xl border border-accent/40 bg-bg-surface p-6 flex flex-col gap-5 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="font-mono text-[10px] px-3 py-1 bg-accent text-bg-base rounded-full uppercase tracking-widest font-bold">
                Most popular
              </span>
            </div>

            {/* Tier label + early access badge */}
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs text-accent uppercase tracking-widest">Pro</p>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent uppercase tracking-wider font-semibold">
                Early access
              </span>
            </div>

            {/* Price */}
            <div>
              <div className="flex items-end gap-2 mb-1.5">
                <span className="font-mono text-4xl font-bold text-text-primary">$9</span>
                <span className="text-sm text-text-secondary mb-1">/month</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-secondary line-through">$29</span>
                <span className="text-xs text-text-muted">Locked in for life.</span>
              </div>
            </div>

            {/* CTA */}
            {!alreadyPro ? (
              isLoaded && !isSignedIn ? (
                <a
                  href="/sign-in?redirect_url=/upgrade"
                  className="w-full h-10 flex items-center justify-center bg-accent text-bg-base text-sm font-semibold rounded-lg hover:bg-accent-bright transition-colors"
                >
                  Subscribe
                </a>
              ) : (
                <button
                  onClick={handleCheckout}
                  disabled={loading || !isLoaded}
                  className="w-full h-10 bg-accent text-bg-base text-sm font-semibold rounded-lg hover:bg-accent-bright transition-colors disabled:opacity-60"
                >
                  {loading ? "Redirecting..." : "Subscribe"}
                </button>
              )
            ) : (
              <div className="w-full h-10 flex items-center justify-center rounded-lg border border-accent/30 gap-2">
                <span className="text-xs font-mono text-accent">✓</span>
                <span className="text-sm font-semibold text-accent">Current plan</span>
              </div>
            )}

            <ul className="space-y-3">
              {PRO_FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-2.5">
                  <span className="text-accent text-sm shrink-0 mt-0.5">✓</span>
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-sm leading-snug ${f.label === "Everything in Free" ? "text-text-muted" : "text-text-secondary"}`}>
                      {f.label}
                    </span>
                    {f.detail && (
                      <p className="text-xs text-text-muted leading-relaxed">{f.detail}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {error && <p className="text-xs text-diff-rem-text mt-6 text-center">{error}</p>}

        <p className="text-xs text-text-muted text-center mt-8">
          Cancel anytime. Billed monthly. By subscribing you agree to our{" "}
          <Link href="/terms" className="underline hover:text-text-secondary transition-colors">Terms</Link>
          {" "}and{" "}
          <Link href="/privacy" className="underline hover:text-text-secondary transition-colors">Privacy Policy</Link>.
        </p>
        <p className="text-xs text-text-muted text-center mt-3">
          Not financial advice. For informational purposes only.
        </p>

      </div>
    </div>
  );
}
