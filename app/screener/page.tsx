// app/screener/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import InsiderTape from "../components/InsiderTape";
import CryptoDashboard from "../components/CryptoDashboard";
import { useSearchParams, useRouter } from "next/navigation";

type TabKey = "insider" | "crypto";

export default function ScreenerPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // ---- tab state with deep-link support (?tab=crypto) ----
  const initialTab = (searchParams.get("tab") as TabKey) || "insider";
  const [tab, setTab] = useState<TabKey>(initialTab);

  // When tab changes, keep URL in sync (no full reload)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", tab);
    const next = `${window.location.pathname}?${sp.toString()}`;
    window.history.replaceState(null, "", next);
  }, [tab]);

  // ---- INSIDER filters ----
  const [symbol, setSymbol] = useState<string>(""); // optional filter
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [start, setStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState<string>(today);
  const [txnType, setTxnType] = useState<"ALL" | "A" | "D">("ALL");

  // Build a queryKey so InsiderTape can refetch when filters change
  const queryKey = useMemo(
    () => [symbol || "ALL", start, end, txnType].join("|"),
    [symbol, start, end, txnType]
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Screener</h1>
        <p className="text-sm text-gray-600">Switch between insider activity and crypto stats.</p>
      </header>

      {/* Tabs */}
      <div className="mb-5 flex items-center gap-2 rounded-lg border bg-white p-1">
        <TabButton active={tab === "insider"} onClick={() => setTab("insider")}>
          Insider Activity
        </TabButton>
        <TabButton active={tab === "crypto"} onClick={() => setTab("crypto")}>
          Crypto
        </TabButton>
      </div>

      {/* Panels */}
      {tab === "insider" ? (
        <section className="space-y-4">
          {/* Filters */}
          <div className="rounded-2xl border bg-white p-4">
            <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
              <div>
                <div className="mb-1 text-xs text-gray-700">Symbol (optional)</div>
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g., NVDA"
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-700">Start</div>
                <input
                  type="date"
                  value={start}
                  max={end}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-700">End</div>
                <input
                  type="date"
                  value={end}
                  min={start}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-700">Transaction</div>
                <select
                  value={txnType}
                  onChange={(e) => setTxnType(e.target.value as "ALL" | "A" | "D")}
                  className="w-full rounded-md border px-3 py-2"
                >
                  <option value="ALL">All</option>
                  <option value="A">Acquired (A)</option>
                  <option value="D">Disposed (D)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Insider list */}
          <InsiderTape
            symbol={symbol.trim()}
            start={start}
            end={end}
            txnType={txnType}
            queryKey={queryKey}
          />
        </section>
      ) : (
        <section>
          <CryptoDashboard />
        </section>
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm transition ${
        active ? "bg-black text-white" : "bg-white hover:bg-gray-50"
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}