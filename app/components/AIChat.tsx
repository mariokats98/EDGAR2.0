"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Prevent page scroll when the sheet is open (mobile) */
function useLockBody(lock: boolean) {
  useEffect(() => {
    const original = document.body.style.overflow;
    if (lock) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [lock]);
}

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Give me today’s CPI headline and link",
  "List NVDA 8-Ks from 2024 with links",
  "Download the latest TSLA 10-Q",
  "Show real GDP last quarter with a link",
];

/** simple URL finder */
function extractUrls(text: string): string[] {
  const urlRe = /\bhttps?:\/\/[^\s<>")]+/gi;
  const found = text.match(urlRe) || [];
  // de-dup and preserve order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of found) {
    if (!seen.has(u)) { seen.add(u); out.push(u); }
  }
  return out;
}

export default function AIChat() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi! Ask for filings or economic data and I’ll return **download links** when available. Example: “NVDA latest 8-K link” or “Real GDP link last quarter”.",
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLockBody(open);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, open, sending]);

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
      const reply =
        j?.reply ||
        j?.choices?.[0]?.message?.content ||
        "No response.";
      setHistory((h) => [...h, { role: "assistant", content: reply }]);
    } catch {
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
            if ((e.target as HTMLElement)?.dataset?.overlay === "1") setOpen(false);
          }}
          data-overlay="1"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" />

          {/* Sheet/Panel */}
          <div
            className="
              absolute right-0 bottom-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2
              w-full md:w-[380px] h-[85vh] md:h-[560px]
              md:mr-4 md:rounded-2xl
              bg-white shadow-xl border flex flex-col
            "
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
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
                  <div className="text-[11px] text-gray-500">I’ll return links when available</div>
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

            {/* Thinking bar */}
            {sending && (
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 bg-slate-50 border-b">
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-blue-600" />
                Assistant is thinking…
              </div>
            )}

            {/* Messages */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-slate-50">
              {history.map((m, i) => {
                const urls = useMemo(() => extractUrls(m.content), [m.content]);
                const hasLinks = urls.length > 0 && m.role === "assistant";

                return (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap
                        ${m.role === "user"
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                          : "bg-white border"}`
                      }
                    >
                      {/* If assistant provided links, prioritize showing them as buttons */}
                      {hasLinks ? (
                        <div className="space-y-2">
                          <div className="text-[11px] text-gray-600">
                            Links found:
                          </div>
                          <div className="flex flex-col gap-2">
                            {urls.map((u, j) => (
                              <a
                                key={j}
                                href={u}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[13px] hover:bg-gray-50"
                              >
                                <span className="truncate">{u}</span>
                                <span className="shrink-0 rounded-md bg-black text-white px-2 py-0.5 text-xs">
                                  Open
                                </span>
                              </a>
                            ))}
                          </div>

                          {/* Expandable raw text (optional) */}
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[11px] text-gray-500">Show assistant text</summary>
                            <div className="mt-1 text-[13px]">{m.content}</div>
                          </details>
                        </div>
                      ) : (
                        <>{m.content}</>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Starters (only when short history) */}
              {history.length <= 2 && !sending && (
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
                  placeholder="Ask for links: “Download latest TSLA 10-Q”, “CPI headline link”, etc."
                  className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60
                             bg-gradient-to-r from-blue-600 to-indigo-600"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
