// app/screener/ClientScreener.tsx
"use client";

import { useMemo, useState } from "react";
import InsiderTape, { TxnFilter } from "../components/InsiderTape";
import CryptoDashboard from "../components/CryptoDashboard"; // keep if you already have it

type Tab = "insider" | "crypto";

export default function ClientScreener() {
  const [tab, setTab] = useState<Tab>("insider");

  // Global filters for Insider tab
  const [symbol, setSymbol] = useState<string>(""); // user must input
  const [start, setStart] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState<string>(new Date().toISOString().slice(0, 10));
  const [txnType, setTxnType] = useState<TxnFilter>("ALL");

  // Unique key for refetching child when filters change
  const queryKey = useMemo(
    () => `${symbol}|${start}|${end}|${txnType}`,
    [symbol, start, end, txnType]
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Screener</h1>

      {/* Tabs */}
      <div className="mt-4 inline-flex rounded-lg border bg-white p-1">
        <button
          className={`px-3 py-1.5 text-sm rounded-md ${
            tab === "insider" ? "bg-black text-white" : "hover:bg-gray-50"
          }`}
          onClick={() => setTab("insider")}
        >
          Insider Activity
        </button>
        <button
          className={`ml-1 px-3 py-1.5 text-sm rounded-md ${
            tab === "crypto" ? "bg-black text-white" : "hover:bg-gray-50"
          }`}
          onClick={() => setTab("crypto")}
        >
          Crypto
        </button>
      </div>

      {tab === "insider" ? (
        <section className="mt-6 space-y-4">
          {/* Top filter row (single source of truth for InsiderTape) */}
          <div className="rounded-2xl border bg-white p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(160px,1fr)_repeat(2,1fr)_auto]">
              <div>
                <div className="mb-1 text-xs text-gray-700">Symbol</div>
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g., AAPL"
                  className="w-full rounded-md border px-3 py-2 placeholder:text-gray-400"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-700">Start</div>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-700">End</div>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-700">Type</div>
                <select
                  value={txnType}
                  onChange={(e) => setTxnType(e.target.value as TxnFilter)}
                  className="w-full rounded-md border px-3 py-2"
                  title="A = Acquired (buy/award); D = Disposed (sale)"
                >
                  <option value="ALL">All</option>
                  <option value="A">A — Acquired (≈ buy/award)</option>
                  <option value="D">D — Disposed (≈ sell)</option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Tip: A = acquired (often purchases/awards). D = disposed (often sales). Always open the filing to confirm details.
            </p>
          </div>

          {/* Show list only after a symbol is provided */}
          {symbol.trim() ? (
            <InsiderTape
              symbol={symbol.trim()}
              start={start}
              end={end}
              txnType={txnType}
              queryKey={queryKey}
            />
          ) : (
            <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500">
              Enter a symbol above to load insider activity.
            </div>
          )}
        </section>
      ) : (
        <section className="mt-6">
          {/* Your existing CryptoDashboard component */}
          <CryptoDashboard />
        </section>
      )}
    </main>
  );
}