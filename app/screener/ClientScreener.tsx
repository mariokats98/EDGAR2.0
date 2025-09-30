// app/screener/ClientScreener.tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import InsiderTape, { TxnFilter } from "../components/InsiderTape";

// Lazy-load heavy dashboards (no SSR) with tiny inline fallbacks
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

type Tab = "stocks" | "insider" | "crypto" | "forex";

const TABS: { key: Tab; label: string }[] = [
  { key: "stocks",  label: "Stocks" },
  { key: "insider", label: "Insider Activity" },
  { key: "crypto",  label: "Crypto" },
  { key: "forex",   label: "Forex" },
];

export default function ClientScreener({ initialTab = "stocks" as Tab }) {
  const router = useRouter();
  const pathname = usePathname();
  const qs = useSearchParams();

  // keep state in sync with URL ?tab=
  const [tab, setTab] = useState<Tab>(() => validTab(qs.get("tab")) ?? initialTab);

  useEffect(() => {
    const now = validTab(qs.get("tab"));
    if (now && now !== tab) setTab(now);
  }, [qs, tab]);

  function validTab(v: string | null): Tab | null {
    if (!v) return null;
    const k = v.toLowerCase();
    return (["stocks", "insider", "crypto", "forex"] as const).includes(k as Tab) ? (k as Tab) : null;
  }

  function go(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(qs.toString());
    params.set("tab", next);
    // shallow push to avoid full reload
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Insider filters (only visible on Insider tab)
  const [symbol, setSymbol] = useState("");
  const [start, setStart] = useState(() =>
    new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10)
  );
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [txnType, setTxnType] = useState<TxnFilter>("ALL");
  const queryKey = useMemo(
    () => `${symbol}-${start}-${end}-${txnType}`,
    [symbol, start, end, txnType]
  );

  return (
    <div className="space-y-5">
      {/* BEAUTIFIED TAB BAR */}
      <div className="flex justify-center">
        <nav
          role="tablist"
          aria-label="Screener Sections"
          className="relative flex w-full max-w-3xl items-center justify-between rounded-full border bg-white/80 px-1 py-1 shadow-sm backdrop-blur"
        >
          {TABS.map(({ key, label }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => go(key)}
                className={[
                  "relative mx-0.5 inline-flex flex-1 items-center justify-center rounded-full px-3 py-2 text-sm transition",
                  active
                    ? "bg-black text-white shadow"
                    : "text-gray-700 hover:bg-gray-100",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bodies */}
      {tab === "stocks" && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <StocksDashboard />
        </section>
      )}

      {tab === "insider" && (
        <>
          {/* Filters */}
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
                >
                  <option value="ALL">All</option>
                  <option value="A">Acquired (A)</option>
                  <option value="D">Disposed (D)</option>
                </select>
              </div>
            </div>
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
            <div className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-500">
              Enter a symbol to begin.
            </div>
          )}
        </>
      )}

      {tab === "crypto" && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <CryptoDashboard />
        </section>
      )}

      {tab === "forex" && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <ForexDashboard />
        </section>
      )}
    </div>
  );
}