"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { getDiffContext, subscribeDiffContext, type DiffContextData } from "@/lib/diffContext";

type Message = { role: "user" | "assistant"; content: string };

const GENERIC_SUGGESTIONS = [
  "What makes a filing change worth acting on?",
  "How does Footnote decide a change scores 9/10 vs 4/10?",
  "What's the Lazy Prices research and why does it predict returns?",
  "How do Risk Factors, MD&A, and Legal Proceedings differ in signal value?",
];

const DIFF_SUGGESTIONS = [
  "Find every change related to AI, China, or litigation",
  "What did they quietly stop saying compared to last year?",
  "Which passages show hardened legal or liability language?",
  "What specific dollar figures or metrics changed in this filing?",
];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<"free" | "pro" | "research" | null>(null);
  const [diffCtx, setDiffCtx] = useState<DiffContextData | null>(getDiffContext);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { isSignedIn, isLoaded } = useUser();
  const pathname = usePathname();

  // Keep local diffCtx in sync with the store
  useEffect(() => subscribeDiffContext(() => setDiffCtx(getDiffContext())), []);

  // Extract ticker from URL (fallback when diff hasn't loaded yet)
  const tickerMatch = pathname.match(/^\/diff\/([^/?]+)/);
  const ticker = diffCtx?.ticker ?? tickerMatch?.[1] ?? null;
  const suggestions = diffCtx ? DIFF_SUGGESTIONS : GENERIC_SUGGESTIONS;

  // Fetch subscription plan when signed in
  useEffect(() => {
    if (!isSignedIn) { setPlan(null); return; }
    fetch("/api/subscription")
      .then((r) => r.ok ? r.json() : { plan: "free" })
      .then((d) => setPlan(d.plan ?? "free"))
      .catch(() => setPlan("free"));
  }, [isSignedIn]);

  // Scroll to latest message
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open && (plan === "pro" || plan === "research")) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, plan]);

  const send = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || loading) return;
    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          context: diffCtx ?? (ticker ? { ticker } : undefined),
        }),
      });
      const data = await res.json();
      const reply = res.ok
        ? (data.content ?? "No response.")
        : (data.error ?? "Something went wrong.");
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Could not reach the assistant. Check your connection and try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Hide on auth and legal pages
  if (!pathname || pathname.startsWith("/sign-") || pathname.startsWith("/terms") || pathname.startsWith("/privacy")) {
    return null;
  }

  return (
    <>
      {/* Panel */}
      {open && (
        <div className="fixed bottom-[92px] right-3 w-[calc(100vw-24px)] sm:bottom-[152px] sm:right-24 sm:w-[370px] max-h-[520px] bg-bg-surface border border-bg-border rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden">

          {/* Header */}
          <div className="shrink-0 px-4 py-2.5 border-b border-bg-border flex items-center justify-between bg-bg-raised">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="font-mono text-xs font-bold text-text-primary tracking-widest uppercase">
                Footnote AI
              </span>
              {diffCtx ? (
                <span className="font-mono text-xs text-accent tracking-wider truncate max-w-[140px]">
                  · {diffCtx.companyName ?? diffCtx.ticker}
                </span>
              ) : ticker ? (
                <span className="font-mono text-xs text-accent tracking-wider">· {ticker}</span>
              ) : null}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-text-muted hover:text-text-primary transition-colors text-xs leading-none"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          {!isLoaded ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1 h-1 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          ) : !isSignedIn ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4 py-10">
              <p className="text-sm text-text-secondary">Sign in to use Footnote AI.</p>
              <a
                href="/sign-in"
                className="text-xs font-semibold px-4 py-2 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors"
              >
                Sign in →
              </a>
            </div>
          ) : plan === "free" ? (
            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
              <div>
                <p className="text-xs font-mono font-bold text-accent uppercase tracking-widest mb-1">Pro feature</p>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Gemini reads the full diff and answers questions in plain English. Ask it to find, explain, or compare anything across the entire filing.
                </p>
              </div>
              <div className="space-y-1.5">
                {DIFF_SUGGESTIONS.map((s) => (
                  <div
                    key={s}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border border-bg-border text-text-muted opacity-50 cursor-default select-none"
                  >
                    {s}
                  </div>
                ))}
              </div>
              <a
                href="/upgrade"
                className="text-xs font-semibold px-4 py-2.5 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors text-center mt-1"
              >
                Upgrade to Pro →
              </a>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {messages.length === 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-text-muted pb-1">
                      {diffCtx
                        ? `Gemini has read the full diff for ${diffCtx.companyName ?? diffCtx.ticker} — ask anything about what changed.`
                        : ticker
                        ? `Ask anything about ${ticker}'s filing changes or SEC disclosures in general.`
                        : "Ask anything about SEC filings and how to read them."}
                    </p>
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg border border-bg-border text-text-muted hover:border-accent/50 hover:text-text-secondary transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[88%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                          m.role === "user"
                            ? "bg-accent text-bg-base font-medium"
                            : "bg-bg-raised text-text-secondary border border-bg-border"
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))
                )}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-bg-raised border border-bg-border px-3 py-2.5 rounded-xl flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="w-1 h-1 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div className="shrink-0 border-t border-bg-border flex items-center gap-2 px-3 py-2 bg-bg-base">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  placeholder={ticker ? `Ask about ${ticker}…` : "Ask about SEC filings…"}
                  disabled={loading}
                  className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || loading}
                  className="text-xs font-semibold text-accent hover:text-accent-bright transition-colors disabled:opacity-30 shrink-0"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-12 right-12 sm:bottom-24 sm:right-24 w-8 h-8 sm:w-11 sm:h-11 bg-accent text-bg-base rounded-full shadow-lg hover:bg-accent-bright transition-all duration-150 z-50 flex items-center justify-center font-mono text-xs sm:text-base select-none opacity-70 sm:opacity-100"
        title="Footnote AI"
        aria-label="Open Footnote AI assistant"
      >
        {open ? "✕" : "✦"}
      </button>
    </>
  );
}
