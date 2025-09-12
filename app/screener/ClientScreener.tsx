// app/screener/ClientScreener.tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import InsiderTape from "../components/InsiderTape";
import CryptoDashboard from "../components/CryptoDashboard";

type TabKey = "insider" | "crypto";

function Tabs({
  current,
  onChange,
}: {
  current: TabKey;
  onChange: (t: TabKey) => void;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm border transition";
  const active =
    "bg-black text-white border-black";
  const idle = "bg-white text-gray-900 hover:bg-gray-50";

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className={`${base} ${current === "insider" ? active : idle}`}
        onClick={() => onChange("insider")}
      >
        Insider Activity
      </button>
      <button
        className={`${base} ${current === "crypto" ? active : idle}`}
        onClick={() => onChange("crypto")}
      >
        Crypto
      </button>
    </div>
  );
}

export default function ClientScreener() {
  const search = useSearchParams();
  const router = useRouter();

  // url state
  const tab = (search.get("tab") as TabKey) || "insider";
  const symbol = search.get("symbol") || "";
  const start = search.get("start") || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const end = search.get("end") || new Date().toISOString().slice(0, 10);
  const txnType = (search.get("txnType") as "ALL" | "A" | "D") || "ALL";

  const setParam = (k: string, v: string) => {
    const s = new URLSearchParams(search.toString());
    if (v) s.set(k, v);
    else s.delete(k);
    router.replace(`?${s.toString()}`);
  };

  const onTabChange = (t: TabKey) => setParam("tab", t);

  const queryKey = useMemo(
    () => [symbol, start, end, txnType].join("|"),
    [symbol, start, end, txnType]
  );

  return (
    <section className="mt-4">
      {/* Tabs */}
      <div className="mb-4">
        <Tabs current={tab} onChange={onTabChange} />
      </div>

      {/* Filters (only visible on Insider tab) */}
      {tab === "insider" && (
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr]">
          <input
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="Ticker (optional)"
            value={symbol}
            onChange={(e) => setParam("symbol", e.target.value.toUpperCase())}
          />
          <input
            type="date"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={start}
            onChange={(e) => setParam("start", e.target.value)}
          />
          <input
            type="date"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={end}
            onChange={(e) => setParam("end", e.target.value)}
          />
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={txnType}
            onChange={(e) => setParam("txnType", e.target.value)}
          >
            <option value="ALL">All Txns</option>
            <option value="A">Acquisitions (A)</option>
            <option value="D">Dispositions (D)</option>
          </select>
        </div>
      )}

      {/* Panels */}
      <div className="rounded-2xl border bg-white p-4">
        {tab === "insider" ? (
          <InsiderTape
            symbol={symbol.trim()}
            start={start}
            end={end}
            txnType={txnType as any}
            queryKey={queryKey}
          />
        ) : (
          <CryptoDashboard />
        )}
      </div>
    </section>
  );
}