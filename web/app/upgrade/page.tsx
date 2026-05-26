"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

const FEATURES = [
  "Watchlist: track up to 50 tickers",
  "Daily email alerts when language changes",
  "Novelty threshold control (Notable / High / Critical)",
  "Full historical diff explorer",
  "All sections: Risk Factors, MD&A, Legal",
];

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
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

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      {/* Nav */}
      <nav className="border-b border-bg-border">
        <div className="max-w-3xl mx-auto px-6 h-12 flex items-center justify-between">
          <Link href="/" className="font-mono text-sm font-bold text-text-primary hover:text-accent transition-colors">
            FOOTNOTE
          </Link>
          <button
            onClick={() => router.back()}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            ← Back
          </button>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-md w-full">

          {/* Early access badge */}
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-accent/30 bg-accent/5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="font-mono text-xs text-accent uppercase tracking-widest">Early access pricing</span>
          </div>

          {/* Header */}
          <div className="mb-10">
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-sm text-text-muted line-through">$29</span>
              <h1 className="font-mono text-4xl font-bold text-text-primary">
                $9<span className="text-xl text-text-muted font-normal">/mo</span>
              </h1>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Locked in for early subscribers. Institutional tools charge $15,000/year
              for this signal. This price won&apos;t last.
            </p>
          </div>

          {/* Features */}
          <div className="rounded-xl border border-bg-border divide-y divide-bg-border overflow-hidden mb-8">
            {FEATURES.map((f) => (
              <div key={f} className="px-5 py-3 flex items-center gap-3">
                <span className="text-accent text-sm shrink-0">✓</span>
                <span className="text-sm text-text-secondary">{f}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          {isLoaded && !isSignedIn ? (
            <a
              href={`/sign-in?redirect_url=/upgrade`}
              className="w-full h-12 bg-accent text-bg-base font-semibold text-sm rounded-lg hover:bg-accent-bright transition-colors font-mono tracking-wide flex items-center justify-center"
            >
              Sign in to subscribe →
            </a>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={loading || !isLoaded}
              className="w-full h-12 bg-accent text-bg-base font-semibold text-sm rounded-lg hover:bg-accent-bright transition-colors disabled:opacity-60 font-mono tracking-wide"
            >
              {loading ? "Redirecting to checkout…" : "Get early access for $9/month →"}
            </button>
          )}
          {error && <p className="text-xs text-diff-rem-text mt-3 text-center">{error}</p>}

          <p className="text-xs text-text-muted text-center mt-4">
            Cancel anytime. Card charged monthly.
          </p>
          <p className="text-xs text-text-muted/50 text-center mt-3">
            By subscribing you agree to our{" "}
            <Link href="/terms" className="underline hover:text-text-muted transition-colors">Terms</Link>
            {" "}and{" "}
            <Link href="/privacy" className="underline hover:text-text-muted transition-colors">Privacy Policy</Link>.
          </p>

        </div>
      </div>
    </div>
  );
}
