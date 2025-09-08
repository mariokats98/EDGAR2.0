// app/ai/page.tsx
"use client";

import { useRef, useState } from "react";

/** ----- Types ----- */
type AIText = { type: "text"; content: string };
type AITimeseries = { type: "timeseries"; title?: string; points: { date: string; value: number }[] };
type AIResp = AIText | AITimeseries;

/** ----- Chart helpers ----- */
function toDate(s: string) {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}
function sortAsc<T extends { date: string }>(arr: T[]) {
  return [...arr].sort((a, b) => +toDate(a.date) - +toDate(b.date));
}
function quarterLabel(dateStr: string) {
  const d = toDate(dateStr);
  return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
}
function monthLabel(dateStr: string) {
  const d = toDate(dateStr);
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
}

/** ----- Lightweight line chart ----- */
function LineChart({ data, title }: { data: { date: string; value: number }[]; title?: string }) {
  const s = sortAsc(data);
  if (s.length < 2) return <div className="text-sm text-gray-500">Not enough data to chart.</div>;

  const width = 720, height = 240, pad = 14;
  const ys = s.map((p) => p.value);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const padY = (maxY - minY) * 0.08;
  const y0 = minY - padY, y1 = maxY + padY;
  const dx = (width - pad * 2) / (s.length - 1);
  const scaleY = (v: number) => y1 === y0 ? height/2 : height - pad - ((v - y0) / (y1 - y0)) * (height - pad*2);

  let path = `M ${pad},${scaleY(ys[0])}`;
  for (let i = 1; i < s.length; i++) path += ` L ${pad + i * dx},${scaleY(ys[i])}`;

  const tickCount = Math.min(8, s.length);
  const step = Math.max(1, Math.round((s.length - 1) / (tickCount - 1)));
  const tickIdxs: number[] = [];
  for (let i = 0; i < s.length; i += step) tickIdxs.push(i);
  if (tickIdxs[tickIdxs.length - 1] !== s.length - 1) tickIdxs.push(s.length - 1);

  // try to guess monthly vs quarterly by gaps
  const monthlyish = (() => {
    if (s.length < 3) return true;
    const g1 = +toDate(s[1].date) - +toDate(s[0].date);
    const g2 = +toDate(s[2].date) - +toDate(s[1].date);
    const avg = (g1 + g2) / 2;
    // ~30 days = monthly; ~90 = quarterly
    return avg < 55 * 24 * 3600 * 1000;
  })();

  return (
    <div className="rounded-xl border bg-white p-3">
      {title && <div className="text-sm font-medium mb-2">{title}</div>}
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title || "chart"}>
        {/* grid */}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = pad + ((height - pad * 2) / 4) * i;
          return <line key={`h${i}`} x1={pad} y1={y} x2={width - pad} y2={y} stroke="#e5e7eb" />;
        })}
        {/* frame */}
        <rect x={pad} y={pad} width={width - pad*2} height={height - pad*2} fill="none" stroke="#d1d5db" />
        {/* line */}
        <path d={path} fill="none" stroke="#0f172a" strokeWidth={2} />
        {/* end points */}
        <circle cx={pad} cy={scaleY(ys[0])} r={2.6} fill="#0f172a" />
        <circle cx={width - pad} cy={scaleY(ys[ys.length - 1])} r={2.6} fill="#0f172a" />
        {/* x ticks */}
        {tickIdxs.map((idx, i) => {
          const x = pad + idx * dx;
          const label = monthlyish ? monthLabel(s[idx].date) : quarterLabel(s[idx].date);
          return (
            <text key={`x${i}`} x={x - 18} y={height - 2} fontSize="10" fill="#6b7280">
              {label}
            </text>
          );
        })}
        {/* y labels (min/mid/max) */}
        <text x={pad + 4} y={pad + 10} fontSize="10" fill="#6b7280">{y1.toLocaleString()}</text>
        <text x={pad + 4} y={height/2 + 3} fontSize="10" fill="#6b7280">{((y0+y1)/2).toLocaleString()}</text>
        <text x={pad + 4} y={height - pad - 2} fontSize="10" fill="#6b7280">{y0.toLocaleString()}</text>
      </svg>
    </div>
  );
}

/** ----- Page ----- */
export default function AIChatPage() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string | AITimeseries }[]>([
    { role: "assistant", content: "Hi! Ask me about EDGAR filings, BLS series, FRED, or BEA (e.g., “Real GDP last 20 years”)." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const j: AIResp = await r.json();
      if (j?.type === "timeseries") {
        setMessages((m) => [...m, { role: "assistant", content: j }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: (j as any)?.content || "Done." }]);
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e?.message || "failed"}` }]);
    } finally {
      setLoading(false);
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Herevna AI</h1>

        <div className="rounded-2xl border bg-white p-4">
          <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <div className={`inline-block rounded-2xl px-3 py-2 ${m.role === "user" ? "bg-black text-white" : "bg-gray-100 text-gray-900"}`}>
                  {typeof m.content === "string" ? (
                    m.content
                  ) : (
                    <div className="max-w-[720px]">
                      <div className="text-sm font-medium mb-1">{m.content.title || "Chart"}</div>
                      <LineChart data={m.content.points} />
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="mt-4 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              className="flex-1 rounded-xl border px-3 py-2"
              placeholder='Try: "Show 8-K headlines for AAPL" or "Plot unemployment rate since 2000"'
            />
            <button onClick={send} disabled={loading} className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-60">
              {loading ? "Thinking…" : "Ask"}
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-3">Sources: SEC EDGAR, BLS, FRED, BEA.</p>
      </div>
    </main>
  );
}

