"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

type Plan = "free" | "pro" | "research" | null;

const PRO_FEATURES = [
  "Watchlist monitoring for any public company",
  "Email alerts when filings change above your threshold",
  "Adjustable novelty threshold per ticker",
  "Word-level diff for language changes",
  "AI chat for parsing disclosures",
  "Monthly digest emails (opt-in)",
];

export default function AccountPage() {
  const [plan, setPlan] = useState<Plan>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const router = useRouter();
  const { isSignedIn, isLoaded, user } = useUser();

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : { plan: "free" }))
      .then((d) => setPlan(d.plan ?? "free"))
      .catch(() => setPlan("free"))
      .finally(() => setLoadingPlan(false));
  }, [isSignedIn]);

  const handleManageBilling = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        router.push(data.url);
      } else {
        setPortalError(data.error ?? "Could not open billing portal");
        setPortalLoading(false);
      }
    } catch {
      setPortalError("Could not connect. Try again.");
      setPortalLoading(false);
    }
  };

  const isPro = plan === "pro" || plan === "research";

  if (isLoaded && !isSignedIn) {
    router.replace("/sign-in?redirect_url=/account");
    return null;
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      {/* Nav */}
      <nav className="border-b border-bg-border">
        <div className="max-w-2xl mx-auto px-6 h-12 flex items-center justify-between">
          <Link
            href="/"
            className="font-mono text-sm font-bold text-text-primary hover:text-accent transition-colors ml-10"
          >
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

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-12 space-y-10">
        {/* Header */}
        <div>
          <h1 className="font-mono text-2xl font-bold text-text-primary mb-1">Account</h1>
          {user?.primaryEmailAddress && (
            <p className="text-sm text-text-muted">
              {user.primaryEmailAddress.emailAddress}
            </p>
          )}
        </div>

        {/* Plan card */}
        <div className="rounded-xl border border-bg-border bg-bg-surface p-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              Current plan
            </p>
            {!loadingPlan && plan !== null && (
              <span
                className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                  isPro
                    ? "border-accent/50 text-accent"
                    : "border-bg-border text-text-muted"
                }`}
              >
                {plan}
              </span>
            )}
          </div>

          {loadingPlan ? (
            <div className="flex gap-1.5 py-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          ) : isPro ? (
            <>
              <ul className="space-y-2.5">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span className="text-accent shrink-0 mt-0.5 text-sm">✓</span>
                    <span className="text-sm text-text-secondary leading-snug">{f}</span>
                  </li>
                ))}
              </ul>

              {/* Billing management */}
              <div className="border-t border-bg-border pt-5 space-y-3">
                <p className="text-xs text-text-muted leading-relaxed">
                  Update your payment method, view invoices, or cancel your subscription.
                  Cancellations take effect at the end of your current billing period.
                </p>
                <button
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="h-10 px-5 bg-bg-raised border border-bg-border text-sm font-medium text-text-primary rounded-lg hover:border-accent/40 hover:text-text-primary transition-colors disabled:opacity-60"
                >
                  {portalLoading ? "Opening portal…" : "Manage billing →"}
                </button>
                {portalError && (
                  <p className="text-xs text-diff-rem-text">{portalError}</p>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary leading-relaxed">
                You&apos;re on the free plan. Upgrade to Pro for watchlist monitoring,
                email alerts, and AI-powered diff analysis — $9/month, locked in for life.
              </p>
              <Link
                href="/upgrade"
                className="inline-flex items-center h-10 px-5 bg-accent text-bg-base text-sm font-semibold rounded-lg hover:bg-accent-bright transition-colors"
              >
                Upgrade to Pro →
              </Link>
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="flex gap-6 text-xs text-text-muted">
          <Link href="/watchlist" className="hover:text-text-secondary transition-colors">
            Watchlist
          </Link>
          <Link href="/upgrade" className="hover:text-text-secondary transition-colors">
            Plans
          </Link>
          <Link href="/terms" className="hover:text-text-secondary transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-text-secondary transition-colors">
            Privacy
          </Link>
        </div>
      </div>
    </div>
  );
}
