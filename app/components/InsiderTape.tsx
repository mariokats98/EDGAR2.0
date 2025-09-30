// app/components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

export type TxnFilter = "ALL" | "A" | "D";

type InsiderRow = {
  symbol?: string;
  transactionDate?: string; // "YYYY-MM-DD"
  reportingCik?: string;
  reportingName?: string;
  transactionType?: string; // "P - Purchase" / "S - Sale" etc (FMP formats vary)
  securitiesOwned?: number;
  shares?: number;
  price?: number;
  link?: string;
};

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

const DEFAULT_FROM = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return toISO(d);
})();
const DEFAULT_TO = toISO(new Date());

export default function InsiderTape() {
  const [symbol, setSymbol] = useState<string>("");
  const [from, setFrom] = useState<string>(DEFAULT_FROM);
  const [to, setTo] = useState<string>(DEFAULT_TO);
  const [filter, setFilter] = useState<TxnFilter>("ALL");
  const [rows, setRows] = useState<InsiderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Build the request URL whenever inputs change
  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (symbol.trim()) params.set("symbol", symbol.trim().toUpperCase());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("limit", "500");
    return `/api/insider/activity?${params.toString()}`;
  }, [symbol, from, to]);

  // Fetch with small debounce so typing feels smooth
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(url, { cache: "no-store" });
        const j = await res.json();
        if (!res.ok || j?.ok === false) throw new Error(j?.error || "Request failed");
        const list: InsiderRow[] = Array.isArray(j.rows) ? j.rows : [];
        setRows(list);
      } catch (e: any) {
        setErr(e?.message || "Unexpected error");
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [url]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return rows;
    // FMP returns transaction type strings; we map common cases to A/D
    return rows.filter((r) => {
      const t = (r.transactionType || "").toUpperCase();
      const isBuy = t.includes("P") || t.includes("BUY") || t.includes("ACQ");
      const isSell = t.includes("S") || t.includes("SELL") || t.includes("DISP");
      return filter === "A" ? isBuy : isSell;
    });
  }, [rows, filter]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_auto_auto_auto_auto]">
          <div>
            <div className="mb-1 text-xs text-gray-700">Ticker</div>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g., NVDA"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-gray-700">From</div>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-gray-700">To</div>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-gray-700">Filter</div>
            <div className="flex rounded-md border p-1">
              {(["ALL", "A", "D"] as TxnFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cls(
                    "w-full rounded px-3 py-1 text-xs font-medium",
                    filter === f ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100"
                  )}
                  aria-pressed={filter === f}
                >
                  {f === "ALL" ? "All" : f === "A" ? "Buys (A)" : "Sells (D)"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                // force refetch by nudging symbol (no-op but retriggers effect)
                setSymbol((s) => s.trim());
              }}
              className="rounded-md bg-black px-4 py-2 text-sm text-white"
              disabled={loading}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {err}
          </div>
        )}
      </section>

      {/* Table */}
      <section className="overflow-x-auto rounded-2xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Insider</th>
              <th className="px-3 py-2 font-medium">Ticker</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Shares</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Owned After</th>
              <th className="px-3 py-2 font-medium">Link</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-600" colSpan={8}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-600" colSpan={8}>
                  No insider trades{symbol ? ` for ${symbol}` : ""} in this range.
                </td>
              </tr>
            ) : (
              filtered.map