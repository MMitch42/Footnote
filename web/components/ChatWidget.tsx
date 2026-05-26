"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What should I look for in Risk Factors?",
  "What does a high-novelty score actually mean?",
  "How do I interpret MD&A language changes?",
  "What's the difference between escalating and reassuring?",
];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<"free" | "pro" | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { isSignedIn, isLoaded } = useUser();
  const pathname = usePathname();

  // Extract ticker + filing context from URL if on diff page
  const tickerMatch = pathname.match(/^\/diff\/([^/?]+)/);
  const ticker = tickerMatch?.[1] ?? null;

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
    if (open && plan === "pro") {
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
          context: ticker ? { ticker } : undefined,
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
        <div className="fixed bottom-[152px] right-24 w-[370px] max-h-[520px] bg-bg-surface border border-bg-border rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden">

          {/* Header */}
          <div className="shrink-0 px-4 py-2.5 border-b border-bg-border flex items-center justify-between bg-bg-raised">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="font-mono text-xs font-bold text-text-primary tracking-widest uppercase">
                Footnote AI
              </span>
              {ticker && (
                <span className="font-mono text-xs text-accent tracking-wider">· {ticker}</span>
              )}
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
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3 py-10">
              <p className="text-sm font-semibold text-text-primary mb-1">Pro feature</p>
              <p className="text-xs text-text-muted leading-relaxed max-w-[260px]">
                Ask questions about any filing, get plain-language explanations of SEC disclosures, and more.
              </p>
              <a
                href="/upgrade"
                className="text-xs font-semibold px-4 py-2 bg-accent text-bg-base rounded-lg hover:bg-accent-bright transition-colors mt-1"
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
                      {ticker
                        ? `Ask anything about ${ticker}'s filing changes or SEC disclosures in general.`
                        : "Ask anything about SEC filings and how to read them."}
                    </p>
                    {SUGGESTIONS.map((s) => (
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
        className="fixed bottom-24 right-24 w-11 h-11 bg-accent text-bg-base rounded-full shadow-lg hover:bg-accent-bright transition-all duration-150 z-50 flex items-center justify-center font-mono text-base select-none"
        title="Footnote AI"
        aria-label="Open Footnote AI assistant"
      >
        {open ? "✕" : "✦"}
      </button>
    </>
  );
}
