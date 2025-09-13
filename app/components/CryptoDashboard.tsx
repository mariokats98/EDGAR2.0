// app/components/CryptoDashboard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
type Coin = { symbol: string; name?: string };

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
    r.push(prev ? (cur - prev) / prev : 0);
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
  return mdd;
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
  // Open on BTC by default
  const [symbol, setSymbol] = useState<string>("BTCUSD");
  const [days, setDays] = useState<number>(90);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // list of all crypto pairs from FMP (proxied)
  const [coins, setCoins] = useState<Coin[]>([]);
  const [listLoading, setListLoading] = useState<boolean>(false);

  // optional BTC benchmark for correlation
  const [btcBars, setBtcBars] = useState<Bar[]>([]);

  // load the master crypto list once
  useEffect(() => {
    let alive = true;
    async function run() {
      try {
        setListLoading(true);
        const r = await fetch("/api/crypto/list", { cache: "no-store" });
        const j = await r.json();
        if (alive && Array.isArray(j.rows)) setCoins(j.rows);
      } catch {
        // small fallback set if the route is missing
        if (alive) {
          setCoins([
            { symbol: "BTCUSD", name: "Bitcoin / USD" },
            { symbol: "ETHUSD", name: "Ethereum / USD" },
            { symbol: "SOLUSD", name: "Solana / USD" },
          ]);
        }
      } finally {
        setListLoading(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, []);

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

  // auto-load BTC on first mount (and whenever default symbol changes)
  useEffect(() => {
    load(symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // normalize to ascending
  const series = useMemo(() => {
    const arr = [...bars];
    arr.sort((a, b) => (a.date < b.date ? -1 : 1));
    return arr;
  }, [bars]);
  const closes = useMemo(
    () => series.map((b) => b.close).filter((v) => typeof v === "number"),
    [series]
  );

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

    const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
    const variance =
      rets.reduce((s, x) => s + Math.pow(x - mean, 2), 0) /
      Math.max(1, rets.length - 1);
    const volAnnual = Math.sqrt(variance) * Math.sqrt(365);

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

  // responsive chart sizing
  const box = useContainerWidth(360);
  const height = Math.max(220, Math.min(520, Math.round(box.width * 0.45)));
  const domain = useMemo(() => minMax(closes), [closes]);

  // filter coins for suggestions
  const [suggest, setSuggest] = useState<Coin[]>([]);
  useEffect(() => {
    const t = symbol.trim().toUpperCase();
    if (!t) {
      setSuggest(coins.slice(0, 12));
      return;
    }
    const out = coins
      .filter(
        (c) =>
          c.symbol.toUpperCase().includes(t) ||
          (c.name || "").toUpperCase().includes(t)
      )
      .slice(0, 12);
    setSuggest(out);
  }, [symbol, coins]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_auto_auto]">
          <div className="relative">
            <div className="mb-1 text-xs text-gray-700">Crypto Pair</div>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") load(symbol.trim());
              }}
              placeholder="e.g., BTCUSD, ETHUSD"
              className="w-full rounded-md border px-3 py-2"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="crypto-suggest"
            />
            {/* suggestions */}
            {suggest.length > 0 && (
              <ul
                id="crypto-suggest"
                className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-white shadow"
              >
                {listLoading && (
                  <li className="px-3 py-2 text-xs text-gray-500">Loading list…</li>
                )}
                {!listLoading &&
                  suggest.map((c) => (
                    <li
                      key={c.symbol}
                      className="cursor-pointer px-3 py-2 hover:bg-gray-50"
                      onClick={() => {
                        setSymbol(c.symbol);
                        setTimeout(() => load(c.symbol), 0);
                      }}
                    >
                      <div className="text-sm text-gray-900">{c.symbol}</div>
                      {c.name && (
                        <div className="text-xs text-gray-500">{c.name}</div>
                      )}
                    </li>
                  ))}
              </ul>
            )}
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
            <div className="text-lg font-semibold text-gray-900">{quote.symbol}</div>
            <div className="ml-auto text-right">
              <div className="text-2xl font-bold text-gray-900">{fmtN(quote.price)}</div>
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
          <div className="mb-2 text-sm font-medium text-gray-900">
            Price Performance ({days}d)
          </div>
          <div ref={box.ref} className="w-full">
            <svg width={box.width} height={Math.max(220, Math.min(520, Math.round(box.width * 0.45)))} role="img">
              {/* grid */}
              {Array.from({ length: 4 }).map((_, i) => {
                const h = Math.max(220, Math.min(520, Math.round(box.width * 0.45)));
                const y = ((i + 1) / 5) * h;
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
              <path
                d={linePath(
                  closes,
                  box.width,
                  Math.max(220, Math.min(520, Math.round(box.width * 0.45))),
                  minMax(closes).lo,
                  minMax(closes).hi
                )}
                fill="none"
                stroke="#0f172a"
                strokeWidth={2}
              />
            </svg>
          </div>
        </section>
      )}

      {/* Performance & Risk */}
      {(() => {
        if (!closes.length) return null;
        const rets = toDailyReturns(closes);
        const last = closes[closes.length - 1];
        const retOver = (d: number) => {
          const i = Math.max(0, closes.length - 1 - d);
          const base = closes[i];
          return base ? (last - base) / base : NaN;
        };
        const r24h = retOver(1);
        const r7d = retOver(7);
        const r30d = retOver(30);
        const mean = rets.reduce((s, x) => s + x, 0) / Math.max(1, rets.length);
        const variance =
          rets.reduce((s, x) => s + Math.pow(x - mean, 2), 0) /
          Math.max(1, rets.length - 1);
        const volAnnual = Math.sqrt(variance) * Math.sqrt(365);
        const mdd = maxDrawdown(closes);
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
        return (
          <section className="rounded-2xl border bg-white p-4 md:p-5">
            <div className="text-sm font-medium text-gray-900 mb-2">
              Performance & Risk
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">Return (24h)</div>
                <div className={`text-base font-semibold ${pctClass(r24h * 100)}`}>
                  {isFinite(r24h) ? (r24h * 100).toFixed(2) + "%" : "—"}
                </div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">Return (7d)</div>
                <div className={`text-base font-semibold ${pctClass(r7d * 100)}`}>
                  {isFinite(r7d) ? (r7d * 100).toFixed(2) + "%" : "—"}
                </div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">Return (30d)</div>
                <div className={`text-base font-semibold ${pctClass(r30d * 100)}`}>
                  {isFinite(r30d) ? (r30d * 100).toFixed(2) + "%" : "—"}
                </div>
              </div>

              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">Volatility (annualized)</div>
                <div className="text-base font-semibold text-gray-900">
                  {isFinite(volAnnual) ? (volAnnual * 100).toFixed(2) + "%" : "—"}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  From daily returns over selected window
                </div>
              </div>

              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">Max Drawdown</div>
                <div className="text-base font-semibold text-gray-900">
                  {isFinite(mdd) ? (mdd * 100).toFixed(2) + "%" : "—"}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Worst peak-to-trough loss over window
                </div>
              </div>

              <div className="rounded-lg border bg-white p-3">
                <div className="text-xs text-gray-500">Correlation vs BTC</div>
                <div className="text-base font-semibold text-gray-900">
                  {typeof corrBTC === "number" && isFinite(corrBTC)
                    ? corrBTC.toFixed(2)
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
        );
      })()}
    </div>
  );
}