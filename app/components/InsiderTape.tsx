// components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  symbol: string;
  insiderName: string;
  tradeDate: string;
  transactionType: "Buy" | "Sell" | "A" | "D" | "Unknown";
  shares: number | null;
  price?: number | null;
  valueUSD?: number | null;
  source: "FMP" | "Finnhub" | "SEC";
  filingUrl?: string;
  indexUrl?: string;
  cik?: string;
};

export default function InsiderTape() {
  const [symbol, setSymbol] = useState<string>("");
  const [start, setStart] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState<string>(new Date().toISOString().slice(0, 10));
  const [side, setSide] = useState<"all" | "buy" | "sell">("all");
  const [limit, setLimit] = useState<number>(50);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (symbol.trim()) sp.set("symbol", symbol.trim().toUpperCase());
    sp.set("start", start);
    sp.set("end", end);
    sp.set("side", side);
    sp.set("limit", String(limit));
    return `/api/insider?${sp.toString()}`;
  }, [symbol, start, end, side, limit]);

  async function load() {
    setLoading(true);
    setError(null);
    setRows([]);
    try {
      const r = await fetch(query, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || "Fetch failed");
      setRows(Array.isArray(j?.data) ? j.data : []);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-4">
      {/* Controls */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end">
          <div>
            <div className="text-sm text-gray-700 mb-1">Symbol (optional)</div>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g., NVDA"
              className="w-full border rounded-md px-3 py-2"
            />
          </div>
          <div>
            <div className="text-sm text-gray-700 mb-1">Start</div>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full border rounded-md px-3 py-2" />
          </div>
          <div>
            <div className="text-sm text-gray-700 mb-1">End</div>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full border rounded-md px-3 py-2" />
          </div>
          <div>
            <div className="text-sm text-gray-700 mb-1">Side</div>
            <select value={side} onChange={(e) => setSide(e.target.value as any)} className="w-full border rounded-md px-3 py-2">
              <option value="all">All</option>
              <option value="buy">Buy only</option>
              <option value="sell">Sell only</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="h-[42px] px-4 rounded-md bg-black text-white text-sm hover:opacity-90"
              disabled={loading}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* Status */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {rows.map((r, idx) => {
          const isBuy = r.transactionType === "Buy";
          const accent = isBuy ? "bg-emerald-100 text-emerald-800" : r.transactionType === "Sell" ? "bg-rose-100 text-rose-800" : "bg-gray-100 text-gray-700";
          const badge = isBuy ? "Buy" : r.transactionType === "Sell" ? "Sell" : r.transactionType;
          const link = r.filingUrl || r.indexUrl;

          return (
            <article key={idx} className="rounded-xl border bg-white p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <div className={`text-xs rounded-full px-2 py-0.5 ${accent}`}>{badge}</div>
                    <div className="text-xs text-gray-500">{r.tradeDate}</div>
                  </div>
                  <div className="text-sm text-gray-600">{r.insiderName}</div>
                  <div className="text-base font-semibold">
                    {r.symbol}{" "}
                    <span className="text-sm font-normal text-gray-500">• {r.source}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-right">
                  <div>
                    <div className="text-xs text-gray-500">Shares</div>
                    <div className="font-medium">{r.shares ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Price</div>
                    <div className="font-medium">{r.price != null ? `$${r.price.toLocaleString()}` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Value</div>
                    <div className="font-semibold">{r.valueUSD != null ? `$${r.valueUSD.toLocaleString()}` : "—"}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-full bg-black text-white px-3 py-1.5 text-sm hover:opacity-90"
                    >
                      Open Filing
                    </a>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {!loading && !error && rows.length === 0 && (
          <div className="text-sm text-gray-600">No trades found for the current filters.</div>
        )}
      </div>
    </section>
  );
}