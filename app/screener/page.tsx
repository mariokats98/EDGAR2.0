// app/screener/page.tsx
"use client";

import { useState } from "react";
import InsiderTape from "../components/InsiderTape"; // << correct default import

export default function ScreenerPage() {
  const [symbol, setSymbol] = useState("NVDA");
  const [start, setStart] = useState("2024-01-01");
  const [end, setEnd] = useState("");
  const [txnType, setTxnType] = useState<"ALL" | "A" | "D">("ALL");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Insider Tape</h1>

      {/* Controls */}
      <section className="mt-4 rounded-2xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <input
            className="w-full border rounded-md px-3 py-2"
            placeholder="Ticker (e.g., NVDA)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          />
          <input
            type="date"
            className="w-full border rounded-md px-3 py-2"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <input
            type="date"
            className="w-full border rounded-md px-3 py-2"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <select
            className="w-full border rounded-md px-3 py-2"
            value={txnType}
            onChange={(e) => setTxnType(e.target.value as "ALL" | "A" | "D")}
          >
            <option value="ALL">All</option>
            <option value="A">Acquired (A)</option>
            <option value="D">Disposed (D)</option>
          </select>
        </div>
      </section>

      {/* List */}
      <InsiderTape
        symbol={symbol}
        start={start || undefined}
        end={end || undefined}
        txnType={txnType}
        queryKey={`${symbol}|${start}|${end}|${txnType}`}
      />
    </main>
  );
}