// app/screener/page.tsx
"use client";

import { useState } from "react";
// If InsiderTape.tsx is in app/components/InsiderTape.tsx use this:
import InsiderTape from "../components/InsiderTape";
// If you actually put it at /components/InsiderTape.tsx instead, then use:
// import InsiderTape from "../../components/InsiderTape";

export default function ScreenerPage() {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [symbol, setSymbol] = useState("NVDA");
  const [start, setStart] = useState(thirtyAgo);
  const [end, setEnd] = useState(today);
  const [txnType, setTxnType] = useState<"ALL" | "A" | "D">("ALL");

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50 p-6">
      <h1 className="text-2xl font-bold mb-4">Insider Transactions</h1>

      {/* Filter controls */}
      <div className="mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm font-medium">Symbol / Ticker</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="mt-1 block w-32 rounded border px-2 py-1 text-sm"
            placeholder="AAPL"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Start Date</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 block rounded border px-2 py-1 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">End Date</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 block rounded border px-2 py-1 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Txn Type</label>
          <select
            value={txnType}
            onChange={(e) => setTxnType(e.target.value as "ALL" | "A" | "D")}
            className="mt-1 block rounded border px-2 py-1 text-sm"
          >
            <option value="ALL">All</option>
            <option value="A">Buy (A)</option>
            <option value="D">Sell (D)</option>
          </select>
        </div>
      </div>

      {/* Insider transactions list */}
      <InsiderTape
        symbol={symbol}
        start={start}
        end={end}
        txnType={txnType}
        queryKey={`${symbol}-${start}-${end}-${txnType}`}
      />
    </main>
  );
}