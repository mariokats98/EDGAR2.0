// app/components/CryptoDashboard.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
// (rest unchanged)

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Quote = {
  symbol: string;
  price?: number;
  change?: number;
  changesPercentage?: number;
  open?: number;
  previousClose?: number;
  dayLow?: number;
  dayHigh?: number;
  marketCap?: number;
};

type Bar = { date: string; close: number };

// ---- tiny helpers ----
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const fmt = (n?: number, d = 2) =>
  typeof n === "number" && isFinite(n) ? n.toFixed(d) : "—";
const fmtNum = (n?: number) =>
  typeof n === "number" && isFinite(n) ? n.toLocaleString() : "—";
const pctClass = (p?: number) =>
  typeof p !== "number"
    ? "text-gray-600"
    : p > 0
    ? "text-emerald-600"
    : p < 0
    ? "text-rose-600"
    : "text-gray-600";

// keep this **very** permissive for symbols but safe
const cleanSymbol = (s: string) =>
  (s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 20) || "BTCUSD";

// compute simple SVG path
function minMax(vals: number[]) {
  if (!vals.length) return { lo: 0, hi: 1 };
  let lo = +Infinity,
    hi = -Infinity;
  for (const v of vals) {
    if (isFinite(v)) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!isFinite(lo) || !isFinite(hi)) return { lo: 0, hi: 1 };
  if (lo === hi) return { lo: lo - 1, hi: hi + 1 };
  return { lo, hi };
}
function linePath(
  series: number[],
  width: number,
  height: number,
  lo: number,
  hi: number,
  pad = 8
) {
  const n = series.length;
  if (n === 0) return "M0 0";
  const w = Math.max(10, width);
  const h = Math.max(50, height);
  const rng = hi - lo || 1;
  const stepX = n > 1 ? w / (n - 1) : w;
  let d = "";
  for (let i = 0; i < n; i++) {
    const v = series[i];
    if (typeof v !== "number" || !isFinite(v)) continue;
    const x = i * stepX;
    const y = h - pad - ((v - lo) / rng) * (h - 2 * pad);
    d += (d ? " L " : "M ") + x.toFixed(2) + " " + clamp(y, 0, h).toFixed(2);
  }
  return d || "M0 0";
}

// responsive width observer
function useBoxWidth(min = 320) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState<number>(min);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const ww = entries[0]?.contentRect?.width || min;
      setW(Math.max(min, Math.round(ww)));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [min]);
  return { ref, width: w };
}

export default function CryptoDashboard() {
  const [symbol, setSymbol] = useState<string>("BTCUSD"); // open on BTC
  const [days, setDays] = useState<number>(90);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const box = useBoxWidth(360);
  const chartH = useMemo(
    () => Math.max(220, Math.min(520, Math.round(box.width * 0.45))),
    [box.width]
  );

  const closes = useMemo(
    () => bars.map((b) => b.close).filter((n) => typeof n === "number" && isFinite(n)),
    [bars]
  );
  const domain = useMemo(() => minMax(closes), [closes]);

  async function load(sym: string, win = days) {
    const s = cleanSymbol(sym);
    if (!s) return;
    setLoading(true);
    setError(null);
    try {
      const q = await fetch(`/api/crypto/quote?symbol=${encodeURIComponent(s)}`, {
        cache: "no-store",
      });
      const qj = await q.json();
      if (!q.ok || qj?.ok === false) throw new Error(qj?.error || "Quote failed");
      setQuote(qj.quote || null);

      const h = await fetch(
        `/api/crypto/history?symbol=${encodeURIComponent(s)}&days=${encodeURIComponent(
          String(win)
        )}`,
        { cache: "no-store" }
      );
      const hj = await h.json();
      if (!h.ok || hj?.ok === false) throw new Error(hj?.error || "History failed");
      const rows: Bar[] = Array.isArray(hj.rows) ? hj.rows : [];
      // force ascending order for chart
      rows.sort((a, b) => (a.date < b.date ? -1 : 1));
      setBars(rows);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
      setQuote(null);
      setBars([]);
    } finally {
      setLoading(false);
    }
  }

  // initial load
  useEffect(() => {
    load("BTCUSD", days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_auto_auto]">
          <div>
            <div className="mb-1 text-xs text-gray-700">Crypto Pair</div>
            <input
              value={symbol}
              onChange={(e) => setSymbol(cleanSymbol(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") load(symbol, days);
              }}
              placeholder="BTCUSD, ETHUSD, SOLUSD…"
              className="w-full rounded-md border px-3 py-2"
              inputMode="text"
            />
            <div className="mt-1 text-[11px] text-gray-500">
              Tip: FMP symbols are usually like <span className="font-mono">BTCUSD</span> (no dash).
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-gray-700">Window</div>
            <select
              value={days}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setDays(n);
                // reload immediately to avoid stale view
                setTimeout(() => load(symbol, n), 0);
              }}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>365 days</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => load(symbol, days)}
              disabled={!symbol || loading}
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Loading…" : "Load"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
      </section>

      {/* Quote */}
      {quote && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <div className="flex items-center gap-4">
            <div className="text-lg font-semibold text-gray-900">{quote.symbol}</div>
            <div className="ml-auto text-right">
              <div className="text-2xl font-bold text-gray-900">{fmt(quote.price)}</div>
              <div className={`text-sm ${pctClass(quote.changesPercentage)}`}>
                {typeof quote.change === "number"
                  ? (quote.change >= 0 ? "+" : "") + quote.change.toFixed(2)
                  : "—"}{" "}
                ({typeof quote.changesPercentage === "number"
                  ? quote.changesPercentage.toFixed(2) + "%"
                  : "—"})
              </div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4">
            <div>
              <span className="text-gray-500">Open:</span>{" "}
              <span className="font-medium text-gray-900">{fmt(quote.open)}</span>
            </div>
            <div>
              <span className="text-gray-500">Prev Close:</span>{" "}
              <span className="font-medium text-gray-900">{fmt(quote.previousClose)}</span>
            </div>
            <div>
              <span className="text-gray-500">Day Low/High:</span>{" "}
              <span className="font-medium text-gray-900">
                {fmt(quote.dayLow)} / {fmt(quote.dayHigh)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Market Cap:</span>{" "}
              <span className="font-medium text-gray-900">{fmtNum(quote.marketCap)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Chart */}
      {closes.length > 1 && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <div className="mb-2 text-sm font-medium text-gray-900">Price Performance ({days}d)</div>
          <div ref={box.ref} className="w-full">
            <svg
              width={box.width || 360}
              height={chartH || 240}
              role="img"
              aria-label="Price chart"
            >
              {/* grid */}
              {Array.from({ length: 4 }).map((_, i) => {
                const y = ((i + 1) / 5) * (chartH || 240);
                return (
                  <line
                    key={i}
                    x1={0}
                    y1={y}
                    x2={box.width || 360}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeDasharray="4 4"
                  />
                );
              })}
              <path
                d={linePath(closes, box.width || 360, chartH || 240, domain.lo, domain.hi)}
                fill="none"
                stroke="#0f172a"
                strokeWidth={2}
              />
            </svg>
          </div>
        </section>
      )}
    </div>
  );
}