"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

const FREE_FEATURES = [
  "View the latest diff for any public company",
  "Novelty scores and AI analysis on every change",
  "All sections: Risk Factors, MD&A, Legal",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Watchlist: monitor any public company",
  "Email alerts when filings change",
  "Novelty threshold control",
  "AI chat assistant for parsing disclosures",
  "Keyword search across latest filings",
  "Weekly digest emails (opt-in)",
];

const RESEARCH_FEATURES = [
  "Everything in Pro",
  "Historical filing comparisons (any two dates)",
  "Keyword search across full filing history",
  "Novelty score timeline chart",
  "10-K history back to 2005, last 9 10-Qs",
];

type Tier = "pro" | "research";

export default function UpgradePage() {
  const [loading, setLoading] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();

  const handleCheckout = async (tier: Tier) => {
    setLoading(tier);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (data.url) {
        router.push(data.url);
      } else {
        setError(data.error ?? "Something went wrong");
        setLoading(null);
      }
    } catch {
      setError("Could not start checkout. Try again.");
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      {/* Nav */}
      <nav className="border-b border-bg-border">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
          <Link href="/" className="font-mono text-sm font-bold text-text-primary hover:text-accent transition-colors">
            FOOTNOTE
          </Link>
          <button
            onClick={() => router.back()}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
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

        {/* Pricing grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

          {/* Free */}
          <div className="rounded-xl border border-bg-border bg-bg-surface p-6 flex flex-col gap-6">
            <div>
              <p className="font-mono text-xs text-text-muted uppercase tracking-widest mb-3">Free</p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="font-mono text-3xl font-bold text-text-primary">$0</span>
              </div>
              <p className="text-xs text-text-muted">No account required to browse.</p>
            </div>

            <ul className="space-y-2.5 flex-1">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span className="text-text-muted text-sm shrink-0 mt-0.5">✓</span>
                  <span className="text-sm text-text-secondary leading-snug">{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/"
              className="w-full h-10 flex items-center justify-center border border-bg-border text-sm text-text-secondary rounded-lg hover:border-accent/40 hover:text-text-primary transition-colors"
            >
              Start for free
            </Link>
          </div>

          {/* Pro */}
          <div className="rounded-xl border border-accent/40 bg-bg-surface p-6 flex flex-col gap-6 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="font-mono text-[10px] px-3 py-1 bg-accent text-bg-base rounded-full uppercase tracking-widest font-bold">
                Most popular
              </span>
            </div>

            <div>
              <p className="font-mono text-xs text-accent uppercase tracking-widest mb-3">Pro</p>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-sm text-text-muted line-through">$29</span>
                <span className="font-mono text-3xl font-bold text-text-primary">$9</span>
                <span className="text-sm text-text-muted">/mo</span>
              </div>
              <p className="text-xs text-text-muted">Early access pricing. Locked in for life.</p>
            </div>

            <ul className="space-y-2.5 flex-1">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span className="text-accent text-sm shrink-0 mt-0.5">✓</span>
                  <span className={`text-sm leading-snug ${f === "Everything in Free" ? "text-text-muted" : "text-text-secondary"}`}>{f}</span>
                </li>
              ))}
            </ul>

            {isLoaded && !isSignedIn ? (
              <a
                href="/sign-in?redirect_url=/upgrade"
                className="w-full h-10 flex items-center justify-center bg-accent text-bg-base text-sm font-semibold rounded-lg hover:bg-accent-bright transition-colors"
              >
                Sign in to subscribe
              </a>
            ) : (
              <button
                onClick={() => handleCheckout("pro")}
                disabled={loading !== null || !isLoaded}
                className="w-full h-10 bg-accent text-bg-base text-sm font-semibold rounded-lg hover:bg-accent-bright transition-colors disabled:opacity-60"
              >
                {loading === "pro" ? "Redirecting…" : "Get Pro for $9/month"}
              </button>
            )}
          </div>

          {/* Research */}
          <div className="rounded-xl border border-bg-border bg-bg-surface p-6 flex flex-col gap-6">
            <div>
              <p className="font-mono text-xs text-text-muted uppercase tracking-widest mb-3">Research</p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="font-mono text-3xl font-bold text-text-primary">$49</span>
                <span className="text-sm text-text-muted">/mo</span>
              </div>
              <p className="text-xs text-text-muted">For analysts and serious investors.</p>
            </div>

            <ul className="space-y-2.5 flex-1">
              {RESEARCH_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span className="text-accent text-sm shrink-0 mt-0.5">✓</span>
                  <span className={`text-sm leading-snug ${f === "Everything in Pro" ? "text-text-muted" : "text-text-secondary"}`}>{f}</span>
                </li>
              ))}
            </ul>

            {isLoaded && !isSignedIn ? (
              <a
                href="/sign-in?redirect_url=/upgrade"
                className="w-full h-10 flex items-center justify-center border border-accent/40 text-sm text-accent rounded-lg hover:bg-accent/5 transition-colors"
              >
                Sign in to subscribe
              </a>
            ) : (
              <button
                onClick={() => handleCheckout("research")}
                disabled={loading !== null || !isLoaded}
                className="w-full h-10 border border-accent/40 text-accent text-sm font-semibold rounded-lg hover:bg-accent/5 transition-colors disabled:opacity-60"
              >
                {loading === "research" ? "Redirecting…" : "Get Research for $49/month"}
              </button>
            )}
          </div>

        </div>

        {error && <p className="text-xs text-diff-rem-text mt-6 text-center">{error}</p>}

        <p className="text-xs text-text-muted text-center mt-8">
          Cancel anytime. Billed monthly. By subscribing you agree to our{" "}
          <Link href="/terms" className="underline hover:text-text-secondary transition-colors">Terms</Link>
          {" "}and{" "}
          <Link href="/privacy" className="underline hover:text-text-secondary transition-colors">Privacy Policy</Link>.
        </p>

      </div>
    </div>
  );
}
