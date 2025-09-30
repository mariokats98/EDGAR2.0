// app/components/ForexDashboard.tsx
// app/components/ForexDashboard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FxRow = {
  symbol: string;
  name?: string;
  price?: number;
  bid?: number;
  ask?: number;
  change?: number;
  changesPercentage?: number;
  dayLow?: number;
  dayHigh?: number;
  yearLow?: number;
  yearHigh?: number;
  timestamp?: number;
};

type Bar = {
  date: string;  // ISO-ish string
  open: number;
  high: number;
  low: number;
  close: number;
};

const DEFAULT_SYMBOLS = [
  "EURUSD",
  "USDJPY",
  "GBPUSD",
  "USDCHF",
  "AUDUSD",
  "USDCAD",
  "NZDUSD",
  "EURJPY",
  "EURGBP",
  "GBPJPY",
];

const INTERVALS = ["1min", "5min", "15min", "30min", "1hour", "4hour"] as const;
type Interval = (typeof INTERVALS)[number];

function pctColor(p?: number) {
  if (typeof p !== "number") return "text-gray-600";
  if (p > 0) return "text-emerald-600";
  if (p < 0) return "text-rose-600";
  return "text-gray-600";
}

function Sparkline({ data, width = 200, height = 48 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) {
    return <svg width={width} height={height} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const pts = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const lastUp = data[data.length - 1] >= data[0];
  const stroke = lastUp ? "#10b981" : "#ef4444"; // emerald / rose

  return (
    <svg width={width} height={height}>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        points={pts}
      />
    </svg>
  );
}

export default function ForexDashboard() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [rows, setRows] = useState<FxRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // right panel (chart)
  const [active, setActive] = useState<string>("EURUSD");
  const [interval, setInterval] = useState<Interval>("1hour");
  const [bars, setBars] = useState<Bar[]>([]);
  const [loadingBars, setLoadingBars] = useState(false);

  // fetch quotes
  async function fetchQuotes() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (symbols.length) params.set("symbols", symbols.join(","));
      const r = await fetch(`/api/forex?${params.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || "fetch failed");
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // fetch history
  async function fetchBars(sym: string, iv: Interval) {
    setLoadingBars(true);
    try {
      const params = new URLSearchParams({ symbol: sym, interval: iv, limit: "300" });
      const r = await fetch(`/api/forex/history?${params.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || "fetch bars failed");
      setBars(Array.isArray(j.rows) ? j.rows : []);
    } catch (e: any) {
      setBars([]);
    } finally {
      setLoadingBars(false);
    }
  }

  useEffect(() => {
    fetchQuotes();
  }, []);

  useEffect(() => {
    if (active) fetchBars(active, interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, interval]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => {
      const hay = `${r.symbol} ${r.name ?? ""}`.toLowerCase();
      return hay.includes(t);
    });
  }, [rows, q]);

  const activeRow = useMemo(() => rows.find((r) => r.symbol === active), [rows, active]);
  const sparkData = useMemo(() => (bars.length ? bars.map((b) => b.close) : []), [bars]);

  // add/remove symbols
  function addSymbol(input: string) {
    const sym = input.toUpperCase().replace(/[^A-Z]/g, "");
    if (!sym || sym.length < 6 || sym.length > 8) return; // e.g., "EURUSD"
    if (!symbols.includes(sym)) {
      const next = [...symbols, sym];
      setSymbols(next);
      // soft refresh
      setTimeout(fetchQuotes, 0);
    }
  }
  function removeSymbol(sym: string) {
    const next = symbols.filter((s) => s !== sym);
    setSymbols(next);
    setTimeout(fetchQuotes, 0);
    if (active === sym && next.length) setActive(next[0]);
  }

  return (
    <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
      {/* Left: table */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-xs text-gray-700">Search</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter pairs (e.g., EUR, USDJPY)"
              className="w-64 rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="ml-auto flex items-end gap-2">
            <input
              placeholder="Add pair (e.g., EURUSD)"
              className="w-44 rounded-md border px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") addSymbol((e.target as HTMLInputElement).value);
              }}
            />
            <button
              onClick={fetchQuotes}
              disabled={loading}
              className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
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

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-700">
                <th className="px-3 py-2 text-left">Pair</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Bid</th>
                <th className="px-3 py-2 text-right">Ask</th>
                <th className="px-3 py-2 text-right">Δ</th>
                <th className="px-3 py-2 text-right">%Δ</th>
                <th className="px-3 py-2 text-right">Day Low</th>
                <th className="px-3 py-2 text-right">Day High</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.symbol} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{r.symbol}</div>
                    <div className="text-xs text-gray-500">{r.name ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-right">{r.price?.toFixed(5) ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.bid?.toFixed(5) ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.ask?.toFixed(5) ?? "—"}</td>
                  <td className={`px-3 py-2 text-right ${pctColor(r.change)}`}>
                    {typeof r.change === "number" ? r.change.toFixed(5) : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right ${pctColor(r.changesPercentage)}`}>
                    {typeof r.changesPercentage === "number" ? `${r.changesPercentage.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{r.dayLow?.toFixed(5) ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.dayHigh?.toFixed(5) ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setActive(r.symbol)}
                      className="rounded-md border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                    >
                      Chart →
                    </button>
                    <button
                      onClick={() => removeSymbol(r.symbol)}
                      className="ml-2 rounded-md border bg-white px-2 py-1.5 text-xs hover:bg-gray-50"
                      title="Remove from list"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                    No results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Right: chart */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="flex items-end gap-3">
          <div>
            <div className="text-xs text-gray-600">Active Pair</div>
            <div className="text-lg font-semibold text-gray-900">
              {active}{" "}
              <span className="text-sm font-normal text-gray-500">
                {activeRow?.name ?? ""}
              </span>
            </div>
          </div>
          <div className="ml-auto" />
          <div>
            <div className="mb-1 text-xs text-gray-700">Interval</div>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value as any)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              {INTERVALS.map((iv) => (
                <option key={iv} value={iv}>
                  {iv}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-lg border bg-white p-3">
          {loadingBars ? (
            <div className="py-14 text-center text-sm text-gray-500">Loading chart…</div>
          ) : sparkData.length ? (
            <>
              <Sparkline data={sparkData} width={520} height={120} />
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 md:grid-cols-4">
                <div>
                  <span className="text-gray-500">Last:</span>{" "}
                  <span className="font-medium text-gray-900">
                    {sparkData[sparkData.length - 1].toFixed(5)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">First:</span>{" "}
                  <span className="font-medium text-gray-900">
                    {sparkData[0].toFixed(5)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Min:</span>{" "}
                  <span className="font-medium text-gray-900">
                    {Math.min(...sparkData).toFixed(5)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Max:</span>{" "}
                    <span className="font-medium text-gray-900">
                    {Math.max(...sparkData).toFixed(5)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="py-14 text-center text-sm text-gray-500">No data.</div>
          )}
        </div>
      </section>
    </div>
  );
}