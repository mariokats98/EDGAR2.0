"use client";

import { useEffect, useRef, useState } from "react";

/** Small helper: prevent page scroll when the chat is open (mobile friendly) */
function useLockBody(lock: boolean) {
  useEffect(() => {
    const original = document.body.style.overflow;
    if (lock) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [lock]);
}

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Summarize Tesla’s latest 10-K",
  "Show the CPI trend since 2000",
  "What’s real GDP growth last quarter?",
  "Find all 8-K filings for NVDA in 2024",
];

export default function AIChat() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi! I can answer questions about EDGAR filings, BLS, BEA, and FRED. Try one of the examples below or type your own question.",
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // lock scroll when open (mobile)
  useLockBody(open);

  // auto scroll to bottom on new message
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history, open]);

  // focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  async function send(message: string) {
    if (!message.trim() || sending) return;
    setSending(true);
    setHistory((h) => [...h, { role: "user", content: message }]);
    setInput("");

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const j = await r.json();
      const reply = j?.reply || j?.choices?.[0]?.message?.content || "No response.";
      setHistory((h) => [...h, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setHistory((h) => [
        ...h,
        { role: "assistant", content: "Sorry — I couldn’t reach the chat service." },
      ]);
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-50 rounded-full px-4 py-3 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-black/20
                     bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95"
          aria-label="Open AI chat"
        >
          Ask AI
        </button>
      )}

      {/* Overlay + Panel */}
      {open && (
        <div
          className="fixed inset-0 z-50"
          aria-modal="true"
          role="dialog"
          onClick={(e) => {
            // click outside panel closes (but ignore clicks inside)
            const target = e.target as HTMLElement;
            if (target?.dataset?.overlay === "1") setOpen(false);
          }}
          data-overlay="1"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" />

          {/* Sheet (mobile) / Panel (desktop) */}
          <div
            className="
              absolute right-0 bottom-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2
              w-full md:w-[380px] h-[85vh] md:h-[560px]
              md:mr-4 md:rounded-2xl
              bg-white shadow-xl border
              flex flex-col
            "
            style={{
              // iOS safe-area padding so input isn’t behind the home bar
              paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold">
                  AI
                </span>
                <div className="leading-tight">
                  <div className="text-sm font-semibold">Herevna Assistant</div>
                  <div className="text-[11px] text-gray-500">
                    Ask about EDGAR, BLS, BEA, FRED
                  </div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-gray-600 hover:bg-gray-100"
                aria-label="Close chat"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-slate-50"
            >
              {history.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap
                      ${m.role === "user"
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                        : "bg-white border"}`
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {/* Starters (only when short history) */}
              {history.length <= 2 && (
                <div className="mt-1 grid grid-cols-1 gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left text-xs rounded-lg px-3 py-2 border bg-white hover:bg-gray-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input row */}
            <form onSubmit={onSubmit} className="border-t bg-white">
              <div className="flex items-center gap-2 p-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about CPI, 10-K, real GDP, etc."
                  className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60
                             bg-gradient-to-r from-blue-600 to-indigo-600"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

