// app/screener/ClientScreener.tsx
"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import InsiderTape, { TxnFilter } from "../components/InsiderTape";

const StocksDashboard = dynamic(() => import("../components/StocksDashboard"), { ssr: false });
const CryptoDashboard = dynamic(() => import("../components/CryptoDashboard"), { ssr: false });
const CongressionalTracker = dynamic(() => import("../components/CongressionalTracker"), { ssr: false });

type TabKey = "stocks" | "insider" | "crypto" | "congress";

export default function ClientScreener() {
  const [tab, setTab] = useState<TabKey>("stocks");

  // Insider filters (unchanged)
  const [symbol, setSymbol] = useState("");
  const [start, setStart] = useState(() => new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0,10));
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0,10));
  const [txnType, setTxnType] = useState<TxnFilter>("ALL");
  const queryKey = useMemo(() => `${symbol}-${start}-${end}-${txnType}`, [symbol, start, end, txnType]);

  const tabBtn = (k: TabKey, label: string) => (
    <button
      key={k}
      onClick={() => setTab(k)}
      className={`rounded-full px-4 py-2 text-sm border ${tab === k ? "bg-black text-white" : "bg-white hover:bg-gray-50"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Tabs row — evenly spaced & aligned */}
      <div className="flex flex-wrap gap-2">
        {tabBtn("stocks", "Stocks")}
        {tabBtn("insider", "Insider Activity")}
        {tabBtn("crypto", "Crypto")}
        {tabBtn("congress", "Congressional Tracker")}
      </div>

      {/* Bodies */}
      {tab === "stocks" ? (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          {StocksDashboard ? <StocksDashboard /> : <div className="text-sm text-gray-500">Loading…</div>}
        </section>
      ) : tab === "insider" ? (
        <>
          <section className="rounded-2xl border bg-white p-4 md:p-5">
            <div className="grid gap-3 md:grid-cols-[minmax(160px,1fr)_repeat(2,1fr)_auto]">
              <div>
                <div className="mb-1 text-xs text-gray-700">Symbol</div>
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g., AAPL"
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-700">Start</div>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-700">End</div>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-md border px-3 py-2" />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-700">Type</div>
                <select value={txnType} onChange={(e) => setTxnType(e.target.value as TxnFilter)} className="w-full rounded-md border px-3 py-2">
                  <option value="ALL">All</option>
                  <option value="A">Acquired (A)</option>
                  <option value="D">Disposed (D)</option>
                </select>
              </div>
            </div>
          </section>

          {symbol.trim() ? (
            <InsiderTape symbol={symbol.trim()} start={start} end={end} txnType={txnType} queryKey={queryKey} />
          ) : (
            <div className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-500">
              Enter a symbol to begin.
            </div>
          )}
        </>
      ) : tab === "crypto" ? (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          {CryptoDashboard ? <CryptoDashboard /> : <div className="text-sm text-gray-500">Loading…</div>}
        </section>
      ) : (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          {CongressionalTracker ? <CongressionalTracker /> : <div className="text-sm text-gray-500">Loading…</div>}
        </section>
      )}
    </div>
  );
}