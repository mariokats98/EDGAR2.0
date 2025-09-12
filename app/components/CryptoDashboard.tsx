// app/components/CryptoDashboard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CryptoLite = {
  symbol: string;
  name?: string;
  marketCap?: number;
  price?: number;
  change24h?: number;
};

type Detail = {
  symbol: string;
  name?: string;
  price?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  marketCap?: number;
  dayLow?: number;
  dayHigh?: number;
  yearLow?: number;
  yearHigh?: number;
  series: { date: string; close: number }[];
};

function fmtNum(n?: number, d = 2) {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}
function fmtUsd(n?: number, d = 2) {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: d })}`;
}
function pctClass(p?: number) {
  if (p === undefined || p === null || !Number.isFinite(p)) return "text-gray-700";
  return p >= 0 ? "text-emerald-600" : "text-rose-600";
}

export default function CryptoDashboard() {
  const [list, setList] = useState<CryptoLite[]>([]);
  const [symbol, setSymbol] = useState<string>("BTCUSD");
  const [days, setDays] = useState<30 | 90 | 180>(90);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch list once
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/crypto?fn=list", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || j?.ok === false) throw new Error(j?.error || "Failed list");
        setList(j.rows || []);
        // Pick BTC if available, otherwise first symbol
        if (!symbol && j.rows?.length) setSymbol(j.rows[0].symbol);
      } catch (e: any) {
        setError(e?.message || "Failed to load list");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch detail when symbol/days change
  useEffect(() => {
    if (!symbol) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(`/api/crypto?fn=detail&symbol=${encodeURIComponent(symbol)}&days=${days}`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok || j?.ok === false) throw new Error(j?.error || "Failed detail");
        setDetail(j.data || null);
      } catch (e: any) {
        setError(e?.message || "Failed to load detail");
        setDetail(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [symbol, days]);

  // ---- Chart prep (SVG, no deps) ----
  const series = detail?.series ?? [];
  const chartW = 720;
  const chartH = 260;
  const padding = { top: 16, right: 16, bottom: 24, left: 48 };

  const view = useMemo(() => {
    if (series.length === 0) return null;
    const xs = series.map((_, i) => i);
    const ys = series.map((s) => s.close);

    const xmin = 0;
    const xmax = xs.length - 1;
    const ymin = Math.min(...ys);
    const ymax = Math.max(...ys);
    const xScale = (i: number) =>
      padding.left + (i - xmin) * ((chartW - padding.left - padding.right) / (xmax - xmin || 1));
    const yScale = (v: number) =>
      chartH - padding.bottom - (v - ymin) * ((chartH - padding.top - padding.bottom) / (ymax - ymin || 1));

    const d = series
      .map((s, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(2)} ${yScale(s.close).toFixed(2)}`)
      .join(" ");

    return { xScale, yScale, d, xmin, xmax, ymin, ymax };
  }, [series]);

  // Tooltip interaction
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || !view || series.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const { xmin, xmax } = view;
    const step = (chartW - padding.left - padding.right) / (xmax - xmin || 1);
    let idx = Math.round((x - padding.left) / step);
    idx = Math.max(0, Math.min(series.length - 1, idx));
    setHoverIdx(idx);
  }
  function onLeave() {
    setHoverIdx(null);
  }

  const hoverPoint = hoverIdx !== null ? series[hoverIdx] : null;

  return (
    <section className="rounded-2xl border bg-white p-4 md:p-5">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-wrap gap-3">
          <div>
            <div className="mb-1 text-xs text-gray-700">Crypto</div>
            <select
              className="rounded-md border px-3 py-2"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              {/* Prefer the list (sorted by mkt cap). Fallback to common majors if empty */}
              {list.length > 0
                ? list.map((c) => (
                    <option key={c.symbol} value={c.symbol}>
                      {c.symbol} — {c.name ?? "—"}
                    </option>
                  ))
                : ["BTCUSD", "ETHUSD", "SOLUSD", "BNBUSD", "XRPUSD"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-700">Timeframe</div>
            <div className="flex gap-2">
              {[30, 90, 180].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d as 30 | 90 | 180)}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    days === d ? "bg-black text-white" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  {d}D
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <button
            onClick={() => {
              // manual refresh
              setDays((prev) => (prev === 30 ? 31 : 30)); // quick flip to trigger refetch
              setTimeout(() => setDays(30 as any), 0);
            }}
            className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Price</div>
          <div className="mt-1 text-xl font-semibold">{fmtUsd(detail?.price)}</div>
          <div className={`text-xs mt-1 ${pctClass(detail?.changePercent)}`}>
            {detail?.changePercent !== undefined && detail?.changePercent !== null
              ? `${detail.changePercent.toFixed(2)}%`
              : "—"}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Market Cap</div>
          <div className="mt-1 text-xl font-semibold">{fmtUsd(detail?.marketCap, 0)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Volume (24h)</div>
          <div className="mt-1 text-xl font-semibold">{fmtUsd(detail?.volume, 0)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Day Range</div>
          <div className="mt-1 text-sm">
            {fmtUsd(detail?.dayLow)} — {fmtUsd(detail?.dayHigh)}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">
            {detail?.name ?? detail?.symbol ?? symbol} — Daily Close
          </div>
          {hoverPoint ? (
            <div className="text-xs text-gray-600">
              {hoverPoint.date} • {fmtUsd(hoverPoint.close)}
            </div>
          ) : (
            <div className="text-xs text-gray-500">{series.length} points</div>
          )}
        </div>

        <div className="overflow-x-auto">
          <svg
            ref={svgRef}
            width={chartW}
            height={chartH}
            className="rounded-lg border bg-white"
            onMouseMove={onMouseMove}
            onMouseLeave={onLeave}
          >
            {/* axes */}
            <line
              x1={48}
              y1={chartH - 24}
              x2={chartW - 16}
              y2={chartH - 24}
              stroke="#e5e7eb"
            />
            <line x1={48} y1={16} x2={48} y2={chartH - 24} stroke="#e5e7eb" />

            {/* path */}
            {view && (
              <path
                d={view.d}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* hover dot */}
            {hoverIdx !== null && view && series[hoverIdx] && (
              <>
                <circle
                  cx={view.xScale(hoverIdx)}
                  cy={view.yScale(series[hoverIdx].close)}
                  r={4}
                  fill="#1d4ed8"
                />
                <line
                  x1={view.xScale(hoverIdx)}
                  x2={view.xScale(hoverIdx)}
                  y1={16}
                  y2={chartH - 24}
                  stroke="#94a3b8"
                  strokeDasharray="3,3"
                />
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Error / loading */}
      {loading && <div className="mt-3 text-sm text-gray-600">Loading…</div>}
      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Recent prices */}
      <div className="mt-6">
        <div className="mb-2 text-sm font-medium">Recent Daily Prices</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-700">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">Close</th>
              </tr>
            </thead>
            <tbody>
              {(series.slice(-14).reverse()).map((p, idx) => (
                <tr key={`${p.date}-${idx}`} className="border-b">
                  <td className="px-3 py-2">{p.date}</td>
                  <td className="px-3 py-2 text-right">{fmtUsd(p.close)}</td>
                </tr>
              ))}
              {series.length === 0 && !loading && (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-gray-500">
                    No data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}