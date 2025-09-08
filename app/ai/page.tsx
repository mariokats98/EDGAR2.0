// app/ai/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant" | "system"; content: string };
type ToolLink = { label: string; url: string };

export default function AIPage() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! Ask me about EDGAR filings, BLS, or FRED. I can fetch data and give you clean download links." }
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  async function send() {
    const q = input.trim();
    if (!q) return;
    setInput("");
    setMessages(m => [...m, { role: "user", content: q }]);
    setThinking(true);
    try {
      const r = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, { role: "user", content: q }] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Request failed");

      // If server returned tool results with links, display them nicely before the assistant text
      const linkBlocks: string[] = [];
      if (Array.isArray(j.links) && j.links.length) {
        linkBlocks.push(
          j.links.map((l: ToolLink) => `• [${l.label}](${l.url})`).join("\n")
        );
      }
      const content = [linkBlocks.join("\n"), j.text || ""].filter(Boolean).join("\n\n");

      setMessages(m => [...m, { role: "assistant", content }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", content: `Sorry — ${e?.message || "I couldn't generate a reply."}` }]);
    } finally {
      setThinking(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-semibold mb-4">✨ AI assistant</h1>

        <div className="rounded-2xl border bg-white p-4">
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <div
                  className={`inline-block rounded-2xl px-3 py-2 ${
                    m.role === "user" ? "bg-black text-white" : "bg-gray-100 text-gray-900"
                  } whitespace-pre-wrap`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="inline-flex items-center gap-2 text-gray-600 text-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
                thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="mt-4 flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask for latest EDGAR filing for NVDA, CPI trend since 2015, etc."
              className="flex-1 rounded-xl border px-3 py-2 min-h-[44px]"
            />
            <button
              onClick={send}
              className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-60"
              disabled={thinking}
            >
              Send
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          I’ll fetch data and include **downloadable links** wherever possible (filings, PDFs, CSVs).
        </p>
      </div>
    </main>
  );
}
