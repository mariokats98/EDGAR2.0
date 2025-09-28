// app/screener/ClientScreener.tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import InsiderTape, { TxnFilter } from "../components/InsiderTape";

// ✅ Dynamic imports with visible fallbacks
const StocksDashboard = dynamic(() => import("../components/StocksDashboard"), {
  ssr: false,
  loading: () => <div className="text-sm text-gray-500">Loading Stocks…</div>,
});
const CryptoDashboard = dynamic(() => import("../components/CryptoDashboard"), {
  ssr: false,
  loading: () => <div className="text-sm text-gray-500">Loading Crypto…</div>,
});
const ForexDashboard = dynamic(() => import("../components/ForexDashboard"), {
  ssr: false,
  loading: () => <div className="text-sm text-gray-500">Loading Forex…</div>,
});

// ✅ Proper error boundary (so you see errors instead of a blank page)
import ErrorBoundary from "../components/ErrorBoundary";

type Tab = "stocks" | "insider" | "crypto" | "forex";

// URL <-> tab mapping
const tabToPath: Record<Tab, string> = {
  stocks: "/screener/stocks",
  insider: "/screener/insider-activity",
  crypto: "/screener/crypto",
  forex: "/screener/forex",
};
const pathToTab: Record<string, Tab | undefined> = {
  stocks: "stocks",
  "insider-activity": "insider",
  crypto: "crypto",
  forex: "forex",
};

export default function ClientScreener({ initialTab = "stocks" }: { initialTab?: Tab }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>(initialTab);

  // URL → state (supports back/forward & direct loads)
  useEffect(() => {
    const m = pathname?.match(/\/screener\/([^/?#]+)/);
    const section = m?.[1] ?? "";
    const urlTab = pathToTab[section];
    if (urlTab && urlTab !== tab) setTab(urlTab);
  }, [pathname, tab]);

  // state → URL (when clicking tabs)
  const go = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    router.push(tabToPath[next]);
  };

  // ===== Insider filters (unchanged) =====
  const [symbol, setSymbol] = useState("");
  const [start, setStart] = useState(() =>
    new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10)
  );
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [txnType, setTxnType] = useState<TxnFilter>("ALL");
  const queryKey = useMemo(() => `${symbol}-${start}-${end}-${txnType}`, [symbol, start, end, txnType]);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => go("stocks")}  className={`rounded-full px-4 py-2 text-sm border ${tab === "stocks"  ? "bg-black text-white" : "bg-white"}`}>Stocks</button>
        <button onClick={() => go("insider")} className={`rounded-full px-4 py-2 text-sm border ${tab === "insider" ? "bg-black text-white" : "bg-white"}`}>Insider Activity</button>
        <button onClick={() => go("crypto")}  className={`rounded-full px-4 py-2 text-sm border ${tab === "crypto"  ? "bg-black text-white" : "bg-white"}`}>Crypto</button>
        <button onClick={() => go("forex")}   className={`rounded-full px-4 py-2 text-sm border ${tab === "forex"   ? "bg-black text-white" : "bg-white"}`}>Forex</button>
      </div>

      {/* Panels */}
      {tab === "stocks" && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <ErrorBoundary><StocksDashboard /></ErrorBoundary>
        </section>
      )}

      {tab === "insider" && (
        <>
          <section className="rounded-2xl border bg-white p-4 md:p-5">
            <div className="grid gap-3 md:grid-cols-[minmax(160px,1fr)_repeat(2,1fr)_auto]">
              <div>
                <div className="mb-1 text-xs text-gray-700">Symbol</div>
                <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="e.g., AAPL" className="w-full rounded-md border px-3 py-2" />
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
            <div className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-500">Enter a symbol to begin.</div>
          )}
        </>
      )}

      {tab === "crypto" && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <ErrorBoundary><CryptoDashboard /></ErrorBoundary>
        </section>
      )}

      {tab === "forex" && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <ErrorBoundary><ForexDashboard /></ErrorBoundary>
        </section>
      )}
    </div>
  );
}