"use client";

import { useEffect, useRef, useState } from "react";

export default function AIChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);

  // Open when #ai is present
  useEffect(() => {
    const sync = () => {
      if (typeof window !== "undefined" && window.location.hash === "#ai") {
        setOpen(true);
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // simple scroll-to-bottom on new messages
  useEffect(() => {
    paneRef.current?.scrollTo({ top: paneRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function send() {
    const prompt = input.trim();
    if (!prompt || thinking) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    setThinking(true);

    try {
      const r = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(j?.error || `Request failed (${r.status})`);
      }

      const reply = j?.message ?? "Sorry, I couldn’t generate a reply.";
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Client error");
    } finally {
      setThinking(false);
    }
  }

  return (
    <>
      {/* FAB / opener */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-50 rounded-full bg-black text-white px-4 py-2 shadow-lg hover:opacity-90"
        >
          Ask AI
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-[min(92vw,420px)] rounded-2xl border bg-white shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-2 w-2 rounded-full bg-blue-600 opacity-80" />
                <span className="absolute inline-flex h-2 w-2 rounded-full bg-blue-600 animate-ping" />
              </span>
              <span className="font-medium">Herevna AI</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div ref={paneRef} className="max-h-[50vh] overflow-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === "user" ? "text-gray-900" : "text-gray-800"}`}>
                {m.role === "user" ? (
                  <div className="inline-block rounded-2xl bg-gray-100 px-3 py-2">{m.text}</div>
                ) : (
                  <div className="inline-block rounded-2xl bg-blue-50 px-3 py-2">
                    {/* Basic linkification for “downloadable links” */}
                    {linkify(m.text)}
                  </div>
                )}
              </div>
            ))}

            {thinking && (
              <div className="text-xs text-gray-600 flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
                Thinking…
              </div>
            )}

            {error && <div className="text-xs text-red-600">Error: {error}</div>}
          </div>

          {/* Composer */}
          <div className="border-t p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="flex items-center gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about EDGAR filings, BLS data, etc."
                className="flex-1 rounded-xl border px-3 py-2"
                aria-label="Message"
              />
              <button
                type="submit"
                disabled={thinking}
                className="rounded-xl bg-black text-white px-3 py-2 disabled:opacity-60"
              >
                Send
              </button>
            </form>
            <div className="mt-1 text-[11px] text-gray-500">
              Tip: ask “Give the latest CPI release link” or “Download link for AAPL’s most recent 10-K”.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Turns raw URLs into clickable anchors so your bot can surface “downloadable links”. */
function linkify(text: string) {
  const urlRegex =
    /((https?:\/\/)[\w.-]+(?:\.[\w\.-]+)+(?:[^\s<>"'(){}[\]]*))/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(/^https?:\/\//)) {
      return (
        <a
          key={i}
          href={part}
          className="text-blue-700 underline break-all"
          target="_blank"
          rel="noreferrer"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
