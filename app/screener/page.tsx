"use client";

import { useEffect, useMemo, useState } from "react";

// ---------- types ----------
type Row = {
  symbol: string;
  name: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  price?: number;
  marketCap?: number;
  pe?: number;
  dividendYield?: number;
};

type ScreenerResp = {
  data: Row[];
  page: number;
  nextPage: number | null;
  limit: number;
};

// ---------- utils ----------
function fmtMoney(n?: number) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${n.toFixed(2)}`;
}
function clsx(...xs: (string | false | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

// tiny debounce
function useDebounced<T>(val: T, ms = 300) {
  const [v, setV] = useState(val);
  useEffect(() => {
    const id = setTimeout(() => setV(val), ms);
    return () => clearTimeout(id);
  }, [val, ms]);
  return v;
}

// ---------- sparkline (pure SVG) ----------
function Sparkline({ points }: { points: { t: number; c: number }[] }) {
  if (!points?.length) return <div className="h-10 w-24 bg-gray-100 rounded" />;
  const w = 120;
  const h = 40;
  const values = points.map((p) => p.c);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * (w - 4) + 2);
  const ys = values.map((v) => h - 2 - ((v - min) / range) * (h - 4));

  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-[120px] overflow-visible">
      <polyline fill="none" strokeWidth="2" stroke={up ? "#16a34a" : "#dc2626"} points="" />
      <path d={d} fill="none" stroke={up ? "#16a34a" : "#dc2626"} strokeWidth={2} />
    </svg>
  );
}

// ---------- chart modal ----------
function ChartModal({
  symbol,
  onClose,
}: {
  symbol: string | null;
  onClose: () => void;
}) {
  const [range, setRange] = useState<"1M" | "3M" | "6M" | "1Y" | "5Y">("3M");
  const [points, setPoints] = useState<{ t: number; c: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    fetch(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&range=${range}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setPoints(j.points || []))
      .catch(() => setPoints([]))
      .finally(() => setLoading(false));
  }, [symbol, range]);

  if (!symbol) return null;

  // simple canvas line for interactivity (tooltip)
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl bg-white shadow-lg p-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">{symbol} • Price Chart</div>
          <button onClick={onClose} className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50">Close</button>
        </div>

        <div className="flex gap-2 mb-3">
          {["1M", "3M", "6M", "1Y", "5Y"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r as any)}
              className={clsx(
                "px-3 py-1 rounded-full text-sm border",
                r === range ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
              )}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="h-[260px] w-full overflow-hidden rounded-lg border bg-white">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">Loading…</div>
          ) : points.length ? (
            <CanvasLine points={points} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">No data</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Canvas renderer with tooltip
function CanvasLine({ points }: { points: { t: number; c: number }[] }) {
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null);

  // draw on canvas
  useEffect(() => {
    const canvas = document.getElementById("chart-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const vals = points.map((p) => p.c);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;

    const pad = 20;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;

    // grid
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach((g) => {
      const y = pad + innerH * (1 - g);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(pad + innerW, y);
      ctx.stroke();
    });

    // line
    ctx.strokeStyle = vals[vals.length - 1] >= vals[0] ? "#16a34a" : "#dc2626";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = pad + (i / (points.length - 1)) * innerW;
      const y = pad + innerH * (1 - (p.c - min) / range);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [points]);

  // mouse tracking
  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = canvas.clientWidth;
    const idx = Math.round((x / w) * (points.length - 1));
    const p = points[Math.max(0, Math.min(points.length - 1, idx))];
    if (!p) return setHover(null);

    // compute y for label
    const vals = points.map((pt) => pt.c);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const pad = 20;
    const innerH = canvas.clientHeight - pad * 2;
    const y = pad + innerH * (1 - (p.c - min) / range);

    const date = new Date(p.t).toLocaleDateString();
    setHover({ x, y, label: `${date} • $${p.c.toFixed(2)}` });
  }

  return (
    <div className="relative h-full w-full">
      <canvas
        id="chart-canvas"
        className="h-full w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      />
      {hover && (
        <div
          className="pointer-events-none absolute rounded bg-black text-white text-xs px-2 py-1"
          style={{ left: Math.max(8, Math.min(hover.x + 8, (window.innerWidth || 800) - 120)), top: hover.y }}
        >
          {hover.label}
        </div>
      )}
    </div>
  );
}

// ---------- main page ----------
const EXCHANGES = ["NASDAQ", "NYSE", "AMEX"];
const SECTORS = [
  "Technology","Financial Services","Healthcare","Industrials","Consumer Cyclical","Consumer Defensive","Energy","Basic Materials","Real Estate","Utilities","Communication Services"
];

export default function ScreenerPage() {
  // filters
  const [exchange, setExchange] = useState<string>("");
  const [sector, setSector] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const debouncedSearch = useDebounced(search, 350);

  const [mktMin, setMktMin] = useState<string>("");
  const [mktMax, setMktMax] = useState<string>("");
  const [peMin, setPeMin] = useState<string>("");
  const [peMax, setPeMax] = useState<string>("");
  const [divMin, setDivMin] = useState<string>("");
  const [divMax, setDivMax] = useState<string>("");

  const [sort, setSort] = useState<string>("marketCap,desc");
  const [limit, setLimit] = useState<number>(50);
  const [page, setPage] = useState<number>(1);

  // data
  const [rows, setRows] = useState<Row[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // chart
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams({
      limit: String(limit),
      page: String(page),
      sort,
    });
    if (exchange) p.set("exchange", exchange);
    if (sector) p.set("sector", sector);
    if (debouncedSearch.trim()) p.set("search", debouncedSearch.trim());
    if (mktMin) p.set("marketCapMin", mktMin);
    if (mktMax) p.set("marketCapMax", mktMax);
    if (peMin) p.set("peMin", peMin);
    if (peMax) p.set("peMax", peMax);
    if (divMin) p.set("dividendMin", divMin);
    if (divMax) p.set("dividendMax", divMax);
    return p.toString();
  }, [exchange, sector, debouncedSearch, limit, page, sort, mktMin, mktMax, peMin, peMax, divMin, divMax]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/market/screener?${qs}`, { cache: "no-store" });
      const j: ScreenerResp | { error: string } = await r.json();
      if (!r.ok || (j as any).error) throw new Error((j as any).error || `Screener failed (${r.status})`);
      const data = (j as ScreenerResp).data || [];
      setRows(data);
      setNextPage((j as ScreenerResp).nextPage ?? null);
    } catch (e: any) {
      setRows([]);
      setNextPage(null);
      setError(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  // auto load when filters change
  useEffect(() => {
    setPage(1); // reset page when filters change
  }, [exchange, sector, debouncedSearch, limit, sort, mktMin, mktMax, peMin, peMax, divMin, divMax]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">Stock Screener</h1>
      <p className="text-gray-600 mb-4">Filter by exchange, sector, valuation, and yield. Click a row for an interactive chart.</p>

      {/* controls */}
      <section className="rounded-2xl border bg-white p-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <div className="text-sm text-gray-700 mb-1">Exchange</div>
            <select value={exchange} onChange={(e) => setExchange(e.target.value)} className="w-full border rounded-md px-3 py-2">
              <option value="">All</option>
              {EXCHANGES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <div className="text-sm text-gray-700 mb-1">Sector</div>
            <select value={sector} onChange={(e) => setSector(e.target.value)} className="w-full border rounded-md px-3 py-2">
              <option value="">All</option>
              {SECTORS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <div className="text-sm text-gray-700 mb-1">Search (symbol or name)</div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="AAPL, Microsoft, etc." className="w-full border rounded-md px-3 py-2" />
          </div>
        </div>

        <div className="mt-3 grid md:grid-cols-3 gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-gray-600 mb-1">Mkt Cap Min ($)</div>
              <input value={mktMin} onChange={(e) => setMktMin(e.target.value)} placeholder="1000000000" className="w-full border rounded-md px-3 py-2" />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Mkt Cap Max ($)</div>
              <input value={mktMax} onChange={(e) => setMktMax(e.target.value)} placeholder="50000000000" className="w-full border rounded-md px-3 py-2" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-gray-600 mb-1">P/E Min</div>
              <input value={peMin} onChange={(e) => setPeMin(e.target.value)} placeholder="5" className="w-full border rounded-md px-3 py-2" />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">P/E Max</div>
              <input value={peMax} onChange={(e) => setPeMax(e.target.value)} placeholder="25" className="w-full border rounded-md px-3 py-2" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-gray-600 mb-1">Dividend ≥</div>
              <input value={divMin} onChange={(e) => setDivMin(e.target.value)} placeholder="0.5" className="w-full border rounded-md px-3 py-2" />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Dividend ≤</div>
              <input value={divMax} onChange={(e) => setDivMax(e.target.value)} placeholder="6" className="w-full border rounded-md px-3 py-2" />
            </div>
          </div>
        </div>

        <div className="mt-3 grid md:grid-cols-[1fr_auto_auto] gap-3">
          <div>
            <div className="text-sm text-gray-700 mb-1">Sort</div>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="w-full border rounded-md px-3 py-2">
              <option value="marketCap,desc">Market Cap ↓</option>
              <option value="marketCap,asc">Market Cap ↑</option>
              <option value="price,desc">Price ↓</option>
              <option value="price,asc">Price ↑</option>
              <option value="pe,asc">P/E ↑</option>
              <option value="pe,desc">P/E ↓</option>
              <option value="dividendYield,desc">Dividend Yield ↓</option>
              <option value="dividendYield,asc">Dividend Yield ↑</option>
            </select>
          </div>

          <div>
            <div className="text-sm text-gray-700 mb-1">Per Page</div>
            <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} className="w-full border rounded-md px-3 py-2">
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => load()}
              disabled={loading}
              className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60"
            >
              {loading ? "Loading…" : "Apply Filters"}
            </button>
          </div>
        </div>
      </section>

      {/* feedback */}
      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* table */}
      <section className="mt-4 rounded-2xl border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Symbol</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Exch</th>
                <th className="text-left px-3 py-2">Sector</th>
                <th className="text-right px-3 py-2">Price</th>
                <th className="text-right px-3 py-2">Mkt Cap</th>
                <th className="text-right px-3 py-2">P/E</th>
                <th className="text-right px-3 py-2">Div%</th>
                <th className="text-left px-3 py-2">Trend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.symbol}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => setChartSymbol(r.symbol)}
                  title="Click to open interactive chart"
                >
                  <td className="px-3 py-2 font-medium">{r.symbol}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.exchange || "—"}</td>
                  <td className="px-3 py-2">{r.sector || "—"}</td>
                  <td className="px-3 py-2 text-right">{r.price != null ? `$${r.price.toFixed(2)}` : "—"}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(r.marketCap)}</td>
                  <td className="px-3 py-2 text-right">{r.pe != null ? r.pe.toFixed(2) : "—"}</td>
                  <td className="px-3 py-2 text-right">{r.dividendYield != null ? r.dividendYield.toFixed(2) : "—"}</td>
                  <td className="px-3 py-2">
                    {/* on-demand tiny sparkline fetch */}
                    <RowSpark symbol={r.symbol} />
                  </td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                    No results. Adjust filters and try again.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* pagination */}
        <div className="flex items-center justify-between p-3 border-t bg-gray-50">
          <div className="text-xs text-gray-600">Page {page}</div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-md border bg-white text-sm disabled:opacity-50"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <input
              type="number"
              value={page}
              onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 text-sm border rounded-md px-2 py-1"
            />
            <button
              className="px-3 py-1.5 rounded-md border bg-white text-sm disabled:opacity-50"
              disabled={!nextPage || loading}
              onClick={() => setPage((p) => (nextPage ? nextPage : p))}
            >
              Next →
            </button>
          </div>
        </div>
      </section>

      {/* modal */}
      {chartSymbol && <ChartModal symbol={chartSymbol} onClose={() => setChartSymbol(null)} />}
    </main>
  );
}

// Fetch tiny series for sparkline on each row (cached by the browser)
function RowSpark({ symbol }: { symbol: string }) {
  const [pts, setPts] = useState<{ t: number; c: number }[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&range=3M`, { cache: "force-cache" })
      .then((r) => r.json())
      .then((j) => alive && setPts(j.points || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [symbol]);
  return <Sparkline points={pts} />;
}