// app/screener/ClientScreener.tsx
"use client";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import InsiderTape, { type TxnFilter } from "../components/InsiderTape";

const CryptoDashboard = dynamic(() => import("../components/CryptoDashboard"), {
  ssr: false,
  loading: () => <div className="text-sm text-gray-500">Loading…</div>,
});

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ClientScreener() {
  const [tab, setTab] = useState<"insider" | "crypto">("insider");

  const [symbol, setSymbol] = useState<string>("");
  const [start, setStart] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return iso(d);
  });
  const [end, setEnd] = useState<string>(iso(new Date()));
  const [txnType, setTxnType] = useState<TxnFilter>("ALL");

  const queryKey = useMemo(
    () => `${symbol}-${start}-${end}-${txnType}`,
    [symbol, start, end, txnType]
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center gap-2">
        <button
          className={`rounded-full px-4 py-2 text-sm ring-1 ${
            tab === "insider"
              ? "bg-black text-white ring-black"
              : "bg-white text-gray-800 ring-gray-300 hover:bg-gray-50"
          }`}
          onClick={() => setTab("insider")}
        >
          Insider Activity
        </button>
        <button
          className={`rounded-full px-4 py-2 text-sm ring-1 ${
            tab === "crypto"
              ? "bg-black text-white ring-black"
              : "bg-white text-gray-800 ring-gray-300 hover:bg-gray-50"
          }`}
          onClick={() => setTab("crypto")}
        >
          Crypto
        </button>
      </div>

      {tab === "insider" ? (
        <>
          <section className="mb-4 rounded-2xl border bg-white p-4 md:p-5">
            <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_repeat(2,1fr)_minmax(140px,160px)]">
              <div>
                <div className="mb-1 text-xs text-gray-700">Symbol</div>
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g., AAPL"
                  className="w-full rounded-md border px-3 py-2"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
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
                <div className="mb-1 text-xs text-gray-700">Type (A/D)</div>
                <select
                  value={txnType}
                  onChange={(e) => setTxnType(e.target.value as TxnFilter)}
                  className="w-full rounded-md border px-3 py-2"
                >
                  <option value="ALL">All (A or D)</option>
                  <option value="A">A — Acquired (e.g., P/A/M)</option>
                  <option value="D">D — Disposed (e.g., S/F/G)</option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              A = Acquired (e.g., purchases, awards, option exercises). D = Disposed (e.g., sales, tax withholdings, gifts).
            </p>
          </section>

          {symbol.trim() ? (
            <InsiderTape
              symbol={symbol.trim()}
              start={start}
              end={end}
              txnType={txnType}
              queryKey={queryKey}
            />
          ) : (
            <section className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
              Enter a ticker above to load insider transactions.
            </section>
          )}
        </>
      ) : (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <CryptoDashboard />
        </section>
      )}
    </main>
  );
}