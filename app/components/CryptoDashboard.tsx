// app/components/CryptoDashboard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * This component expects these API routes to exist:
 *  - GET /api/crypto/quote?symbol=BTCUSD
 *      -> { ok: true, quote: { symbol, price, changesPercentage, change, ... } }
 *  - GET /api/crypto/history?symbol=BTCUSD&days=90
 *      -> { ok: true, rows: [{ date: "YYYY-MM-DD", close: number }, ...] }  (newest last or first; we normalize)
 *
 * If you need the server code, say the word and I’ll paste the handlers that call FMP.
 */

type Quote = {
  symbol: string;
  price?: number;
  change?: number;
  changesPercentage?: number;
  dayLow?: number;
  dayHigh?: number;
  yearLow?: number;
  yearHigh?: number;
  volume?: number;
  previousClose?: number;
  open?: number;
  marketCap?: number;
};

type Bar = { date: string; close: number };

// ---------- small utils ----------
const fmtN = (v?: number, d = 2) =>
  typeof v === "number" && isFinite(v) ? v.toFixed(d) : "—";
const fmtNum = (v?: number) =>
  typeof v === "number" && isFinite(v) ? v.toLocaleString() : "—";
const pctClass = (p?: number) =>
  typeof p !== "number"
    ? "text-gray-600"
    : p > 0
    ? "text-emerald-600"
    : p < 0
    ? "text-rose-600"
    : "text-gray-600";

function toDailyReturns(closes: number[]) {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev && isFinite(prev) && isFinite(cur)) {
      r.push((cur - prev) / prev);
    } else {
      r.push(0);
    }
  }
  return r;
}

function maxDrawdown(series: number[]) {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of series) {
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, (v - peak) / peak);
  }
  return mdd; // negative number
}

function correlation(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  const A = a.slice(-n);
  const B = b.slice(-n);
  const meanA = A.reduce((s, x) => s + x, 0) / n;
  const meanB = B.reduce((s, x) => s + x, 0) / n;
  let num = 0,
    denA = 0,
    denB = 0;
  for (let i = 0; i < n; i++) {
    const da = A[i] - meanA;
    const db = B[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB) || 1e-9;
  return num / den;
}

// ---------- responsive SVG helpers ----------
function useContainerWidth(min = 320) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState<number>(min);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr?.width) setW(Math.max(min, Math.round(cr.width)));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [min]);
  return { ref, width: w };
}

function minMax(values: (number | undefined | null)[]) {
  let lo = +Infinity,
    hi = -Infinity;
  for (const v of values) {
    if (typeof v === "number" && isFinite(v)) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!isFinite(lo) || !isFinite(hi)) return { lo: 0, hi: 1 };
  if (lo === hi) return { lo: lo - 1, hi: hi + 1 };
  return { lo, hi };
}

function linePath(
  series: (number | undefined | null)[],
  width: number,
  height: number,
  lo: number,
  hi: number,
  pad = 6
) {
  const n = series.length;
  if (n === 0) return "M0 0";
  const stepX = n > 1 ? width / (n - 1) : width;
  const rng = hi - lo || 1;
  let d = "";
  for (let i = 0; i < n; i++) {
    const v = series[i];
    if (typeof v !== "number" || !isFinite(v)) continue;
    const x = i * stepX;
    const y = height - pad - ((v - lo) / rng) * (height - 2 * pad);
    d += (d ? " L " : "M ") + x.toFixed(2) + " " + Math.max(0, Math.min(height, y)).toFixed(2);
  }
  return d || "M0 0";
}

// ---------- component ----------
export default function CryptoDashboard() {
  const [symbol, setSymbol] = useState<string>(""); // user inputs, e.g., BTCUSD, ETHUSD
  const [days, setDays] = useState<number>(90);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // optional BTC benchmark for correlation
  const [btcBars, setBtcBars] = useState<Bar[]>([]);

  async function load(sym: string) {
    if (!sym) return;
    setLoading(true);
    setErr(null);
    try {
      // quote
      const q = await fetch(`/api/crypto/quote?symbol=${encodeURIComponent(sym)}`, {
        cache: "no-store",
      });
      const qj = await q.json();
      if (!q.ok || qj?.ok === false) throw new Error(qj?.error || "quote failed");
      setQuote(qj.quote || null);

      // history
      const h = await fetch(
        `/api/crypto/history?symbol=${encodeURIComponent(sym)}&days=${days}`,
        { cache: "no-store" }
      );
      const hj = await h.json();
      if (!h.ok || hj?.ok === false) throw new Error(hj?.error || "history failed");
      setBars(Array.isArray(hj.rows) ? hj.rows : []);

      // BTC reference (for correlation) when not BTCUSD
      if (sym.toUpperCase() !== "BTCUSD") {
        const hb = await fetch(`/api/crypto/history?symbol=BTCUSD&days=${days}`, {
          cache: "no-store",
        });
        const hbj = await hb.json();
        if (hb.ok && hbj?.rows) setBtcBars(hbj.rows);
        else setBtcBars([]);
      } else {
        setBtcBars([]);
      }
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
      setQuote(null);
      setBars([]);
      setBtcBars([]);
    } finally {
      setLoading(false);
    }
  }

  // normalize history to ascending by date
  const series = useMemo(() => {
    const arr = [...bars];
    arr.sort((a, b) => (a.date < b.date ? -1 : 1));
    return arr;
  }, [bars]);

  const closes = useMemo(() => series.map((b) => b.close).filter((v) => typeof v === "number"), [series]);

  // performance & risk
  const perf = useMemo(() => {
    if (closes.length < 2) return null;

    const rets = toDailyReturns(closes);
    const last = closes[closes.length - 1];
    const idxOf = (d: number) => Math.max(0, closes.length - 1 - d);

    const retOver = (d: number) => {
      const i = idxOf(d);
      const base = closes[i];
      return base ? (last - base) / base : NaN;
    };

    const r24h = retOver(1);
    const r7d = retOver(7);
    const r30d = retOver(30);

    // annualized vol from daily returns (sqrt(365))
    const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
    const variance =
      rets.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / Math.max(1, rets.length - 1);
    const volAnnual = Math.sqrt(variance) * Math.sqrt(365);

    // max drawdown on price series
    const mdd = maxDrawdown(closes);

    // correlation vs BTC
    let corrBTC: number | undefined = undefined;
    if (btcBars.length > 1) {
      const btcSeries = [...btcBars].sort((a, b) => (a.date < b.date ? -1 : 1));
      const btcCloses = btcSeries.map((b) => b.close);
      const n = Math.min(closes.length, btcCloses.length);
      if (n > 5) {
        const a = closes.slice(-n);
        const b = btcCloses.slice(-n);
        corrBTC = correlation(a, b);
      }
    }

    return { r24h, r7d, r30d, volAnnual, mdd, corrBTC };
  }, [closes, btcBars]);

  // -------- responsive chart (price line) --------
  const box = useContainerWidth(360);
  const height = Math.max(220, Math.min(520, Math.round(box.width * 0.45)));
  const domain = useMemo(() => minMax(closes), [closes]);

  // -------- render --------
  return (
    <div className="space-y-4">
      {/* Controls */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto_auto_auto]">
          <div>
            <div className="mb-1 text-xs text-gray-700">Crypto Pair</div>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g., BTCUSD, ETHUSD"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-700">Window</div>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
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
              onClick={() => load(symbol.trim())}
              disabled={!symbol.trim() || loading}
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Loading…" : "Load"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {err}
          </div>
        )}
      </section>

      {/* Quote header */}
      {quote && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <div className="flex items-center gap-4">
            <div className="text-lg font-semibold text-gray-900">
              {quote.symbol}
            </div>
            <div className="ml-auto text-right">
              <div className="text-2xl font-bold text-gray-900">
                {fmtN(quote.price)}
              </div>
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
              <span className="font-medium text-gray-900">{fmtN(quote.open)}</span>
            </div>
            <div>
              <span className="text-gray-500">Prev Close:</span>{" "}
              <span className="font-medium text-gray-900">
                {fmtN(quote.previousClose)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Day Low/High:</span>{" "}
              <span className="font-medium text-gray-900">
                {fmtN(quote.dayLow)} / {fmtN(quote.dayHigh)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Market Cap:</span>{" "}
              <span className="font-medium text-gray-900">
                {fmtNum(quote.marketCap)}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Price performance chart */}
      {closes.length > 1 && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <div className="text-sm font-medium text-gray-900 mb-2">
            Price Performance ({days}d)
          </div>
          <div ref={box.ref} className="w-full">
            <svg width={box.width} height={height} role="img" aria-label="Crypto price chart">
              {/* grid */}
              {Array.from({ length: 4 }).map((_, i) => {
                const y = ((i + 1) / 5) * height;
                return (
                  <line
                    key={i}
                    x1={0}
                    y1={y}
                    x2={box.width}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeDasharray="4 4"
                  />
                );
              })}
              {/* line */}
              <path
                d={linePath(closes, box.width, height, domain.lo, domain.hi)}
                fill="none"
                stroke="#0f172a"
                strokeWidth={2}
              />
            </svg>
          </div>
        </section>
      )}

      {/* Performance & Risk (replaces the old "Recent daily prices" table) */}
      {perf && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <div className="text-sm font-medium text-gray-900 mb-2">
            Performance & Risk
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-gray-500">Return (24h)</div>
              <div className={`text-base font-semibold ${pctClass(perf.r24h * 100)}`}>
                {isFinite(perf.r24h) ? (perf.r24h * 100).toFixed(2) + "%" : "—"}
              </div>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-gray-500">Return (7d)</div>
              <div className={`text-base font-semibold ${pctClass(perf.r7d * 100)}`}>
                {isFinite(perf.r7d) ? (perf.r7d * 100).toFixed(2) + "%" : "—"}
              </div>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-gray-500">Return (30d)</div>
              <div className={`text-base font-semibold ${pctClass(perf.r30d * 100)}`}>
                {isFinite(perf.r30d) ? (perf.r30d * 100).toFixed(2) + "%" : "—"}
              </div>
            </div>

            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-gray-500">Volatility (annualized)</div>
              <div className="text-base font-semibold text-gray-900">
                {isFinite(perf.volAnnual) ? (perf.volAnnual * 100).toFixed(2) + "%" : "—"}
              </div>
              <div className="text-xs text-gray-500 mt-1">From daily returns over selected window</div>
            </div>

            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-gray-500">Max Drawdown</div>
              <div className="text-base font-semibold text-gray-900">
                {isFinite(perf.mdd) ? (perf.mdd * 100).toFixed(2) + "%" : "—"}
              </div>
              <div className="text-xs text-gray-500 mt-1">Worst peak-to-trough loss over window</div>
            </div>

            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-gray-500">Correlation vs BTC</div>
              <div className="text-base font-semibold text-gray-900">
                {typeof perf.corrBTC === "number" && isFinite(perf.corrBTC)
                  ? perf.corrBTC.toFixed(2)
                  : symbol.toUpperCase() === "BTCUSD"
                  ? "—"
                  : "—"}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Based on closing prices over the same window
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}