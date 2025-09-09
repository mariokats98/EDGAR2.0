// app/ai/page.tsx
"use client";

import { useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export default function AIPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", content: "Hi! Ask me about EDGAR filings, CPI, FOMC, GDP, etc." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function ask() {
    const q = input.trim();
    if (!q || loading) return;

    setMsgs((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort("timeout"), 25_000); // 25s cap

    try {
      const r = await fetch("/api/ai/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...msgs.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: q },
          ],
        }),
      });

      clearTimeout(timeout);

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        const errText = j?.error || `Request failed (${r.status})`;
        setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${errText}` }]);
      } else {
        setMsgs((m) => [...m, { role: "assistant", content: j.text }]);
      }
    } catch (e: any) {
      const reason = e?.name === "AbortError" ? "Timed out. Try again." : "Network error.";
      setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${reason}` }]);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold mb-3">Herevna AI</h1>

      <div className="rounded-xl border bg-white">
        <div className="p-4 space-y-4 max-h-[60vh] overflow-auto">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <div
                className={
                  m.role === "user"
                    ? "inline-block rounded-2xl bg-black text-white px-3 py-2"
                    : "inline-block rounded-2xl bg-gray-100 px-3 py-2"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-left">
              <div className="inline-block rounded-2xl bg-gray-100 px-3 py-2">
                Thinking…
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-3 flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2"
            placeholder="Ask for a recent 10-K, latest CPI, or FOMC statement…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
          />
          <button
            onClick={ask}
            disabled={loading}
            className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}