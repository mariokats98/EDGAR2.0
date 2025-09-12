"use client";

import { useEffect, useMemo, useState } from "react";
import InsiderTape from "../components/InsiderTape";
import CryptoDashboard from "../components/CryptoDashboard"; // keep if you have this component

type TabKey = "insider" | "crypto";
type TxnFilter = "ALL" | "A" | "D";

export default function ClientScreener() {
  const [tab, setTab] = useState<TabKey>("insider");

  // ------- filters used by Insider tab -------
  const [symbol, setSymbol] = useState(""); // start empty
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [txnType, setTxnType] = useState<TxnFilter>("ALL");
  const [qkey, setQkey] = useState(() => `${Date.now()}`);

  useEffect(() => {
    setQkey(`${symbol}|${start}|${end}|${txnType}|${Date.now()}`);
  }, [symbol, start, end, txnType]);

  const tabs = useMemo(
    () => [
      { id: "insider", label: "Insider Activity" },
      { id: "crypto", label: "Crypto Stats" },
    ] as const,
    []
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Screener</h1>

      {/* Tabs */}
      <div className="mt-4 inline-flex rounded-lg border bg-white p-1">
        {tabs.map((t) => {
          const active = tab === (t.id as TabKey);
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as TabKey)}
              className={[
                "px-3 py-1.5 text-sm rounded-md",
                active ? "bg-black text-white" : "text-gray-700 hover:bg-gray-50",
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* INSIDER TAB */}
      {tab === "insider" && (
        <section className="mt-6 space-y-4">
          {/* Filter bar */}
          <div className="rounded-2xl border bg-white p-4 md:p-5">
            <div className="grid gap-3 md:grid-cols-[minmax(160px,1fr)_repeat(2,1fr)_auto]">
              {/* Symbol */}
              <div>
                <div className="mb-1 text-xs text-gray-700">Symbol</div>
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="Enter ticker (e.g., NVDA)"
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>

              {/* Start */}
              <div>
                <div className="mb-1 text-xs text-gray-700">Start</div>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>

              {/* End */}
              <div>
                <div className="mb-1 text-xs text-gray-700">End</div>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>

              {/* Type (A/D) */}
              <div>
                <div className="mb-1 text-xs text-gray-700">Type</div>
                <select
                  value={txnType}
                  onChange={(e) => setTxnType(e.target.value as TxnFilter)}
                  className="w-full rounded-md border px-3 py-2"
                >
                  <option value="ALL">All</option>
                  <option value="A">Acquired (A)</option>
                  <option value="D">Disposed (D)</option>
                </select>
                <div className="mt-1 text-[11px] text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="font-medium">A = Acquired</span>{" "}
                    <span className="text-gray-400">— like a buy</span>
                  </span>
                  <span className="mx-2 text-gray-300">•</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                    <span className="font-medium">D = Disposed</span>{" "}
                    <span className="text-gray-400">— like a sell</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Insider list */}
          {symbol.trim() && (
            <InsiderTape
              symbol={symbol.trim()}
              start={start}
              end={end}
              txnType={txnType}
              queryKey={qkey}
            />
          )}
        </section>
      )}

      {/* CRYPTO TAB */}
      {tab === "crypto" && (
        <section className="mt-6">
          <CryptoDashboard />
        </section>
      )}
    </main>
  );
}