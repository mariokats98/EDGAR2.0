// app/components/StocksDashboard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

// ---------- types ----------
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
  avgVolume?: number;
  previousClose?: number;
  open?: number;
  marketCap?: number;
  timestamp?: number;
};

type Profile = {
  companyName?: string;
  description?: string;
  sector?: string;
  industry?: string;
  beta?: number;
  ceo?: string;
  exchangeShortName?: string;
  country?: string;
  website?: string;
  range?: string;
  volAvg?: number;
  price?: number;
  lastDiv?: number;
  mktCap?: number;
  fullTimeEmployees?: number;
  currency?: string;
  ipoDate?: string;
  image?: string;
};

type Bar = {
  date: string; // "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss"
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
};

const INTRA = ["1min", "5min", "15min", "30min", "1hour", "4hour"] as const;
type Interval = (typeof INTRA)[number];

// ---------- utils ----------
function n(v?: number, d = 2) {
  return typeof v === "number" ? v.toFixed(d) : "—";
}
function num(v?: number) {
  return typeof v === "number" ? v.toLocaleString() : "—";
}
function pctColor(p?: number) {
  if (typeof p !== "number") return "text-gray-600";
  if (p > 0) return "text-emerald-600";
  if (p < 0) return "text-rose-600";
  return "text-gray-600";
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// indicators
function SMA(data: number[], period: number) {
  if (!data.length || period <= 1) return [];
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) sum -= data[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}
function EMA(data: number[], period: number) {
  if (!data.length || period <= 1) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = data[0];
  out[0] = prev;
  for (let i = 1; i < data.length; i++) {
    prev = data[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
function RSI(data: number[], period = 14) {
  if (data.length < period + 1) return [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    gains.push(Math.max(0, diff));
    losses.push(Math.max(0, -diff));
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const out: number[] = new Array(period).fill(NaN);
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / (avgLoss || 1e-9));
    out.push(rs);
  }
  return out;
}
function MACD(data: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = EMA(data, fast);
  const emaSlow = EMA(data, slow);
  const macd = data.map((_, i) =>
    isFinite(emaFast[i] - emaSlow[i]) ? emaFast[i] - emaSlow[i] : NaN
  );
  const signalLine = EMA(macd.map((v) => (isFinite(v) ? v : 0)), signal);
  const hist = macd.map((v, i) => (isFinite(v - signalLine[i]) ? v - signalLine[i] : NaN));
  return { macd, signal: signalLine, hist };
}

// tiny SVG line
function Polyline({
  series,
  width,
  height,
  stroke,
  strokeWidth = 2,
  yPad = 4,
}: {
  series: (number | undefined | null)[];
  width: number;
  height: number;
  stroke: string;
  strokeWidth?: number;
  yPad?: number;
}) {
  const nums = series.map((v) => (typeof v === "number" && isFinite(v) ? v : NaN));
  const valid = nums.filter((v) => !isNaN(v));
  if (valid.length < 2) return <svg width={width} height={height} />;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const stepX = width / (nums.length - 1);

  const pts = nums.map((v, i) => {
    const x = i * stepX;
    const yVal = isNaN(v) ? NaN : height - yPad - ((v - min) / range) * (height - 2 * yPad);
    const y = isNaN(yVal) ? height - yPad : clamp(yVal, 0, height);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height}>
      <polyline fill="none" stroke={stroke} strokeWidth={strokeWidth} points={pts.join(" ")} />
    </svg>
  );
}

// ---------- component ----------
export default function StocksDashboard() {
  const [symbol, setSymbol] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // history controls
  const [mode, setMode] = useState<"daily" | "intraday">("daily");
  const [interval, setInterval] = useState<Interval>("1hour"); // intraday
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll(sym: string) {
    if (!sym) return;
    setLoading(true);
    setErr(null);
    try {
      // quote + profile
      const q = await fetch(`/api/stocks/quote?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
      const qj = await q.json();
      if (!q.ok || qj?.ok === false) throw new Error(qj?.error || "quote failed");
      setQuote(qj.quote || null);
      setProfile(qj.profile || null);

      // history
      let url = `/api/stocks/history?symbol=${encodeURIComponent(sym)}`;
      if (mode === "intraday") {
        url += `&interval=${interval}&limit=1000`;
      } else {
        url += `&from=${from}&to=${to}&limit=5000`;
      }
      const h = await fetch(url, { cache: "no-store" });
      const hj = await h.json();
      if (!h.ok || hj?.ok === false) throw new Error(hj?.error || "history failed");
      setBars(Array.isArray(hj.rows) ? hj.rows : []);
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
      setBars([]);
      setQuote(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  // compute indicators
  const closes = useMemo(() => bars.map((b) => b.close).filter((v) => typeof v === "number"), [bars]);
  const sma20 = useMemo(() => SMA(closes, 20), [closes]);
  const sma50 = useMemo(() => SMA(closes, 50), [closes]);
  const ema20 = useMemo(() => EMA(closes, 20), [closes]);
  const rsi14 = useMemo(() => RSI(closes, 14), [closes]);
  const macd = useMemo(() => MACD(closes, 12, 26, 9), [closes]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_auto_auto_auto]">
          <div>
            <div className="mb-1 text-xs text-gray-700">Ticker</div>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g., AAPL"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-gray-700">Mode</div>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="daily">Daily (range)</option>
              <option value="intraday">Intraday</option>
            </select>
          </div>

          {mode === "intraday" ? (
            <div>
              <div className="mb-1 text-xs text-gray-700">Interval</div>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value as Interval)}
                className="w-full rounded-md border px-3 py-2"
              >
                {INTRA.map((iv) => (
                  <option key={iv} value={iv}>
                    {iv}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <div className="mb-1 text-xs text-gray-700">From</div>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-700">To</div>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>
            </>
          )}

          <div className="flex items-end">
            <button
              onClick={() => loadAll(symbol.trim())}
              disabled={!symbol.trim() || loading}
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Loading…" : "Load"}
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          Tip: Start with liquid tickers (AAPL, MSFT, NVDA). Indicators shown: <b>SMA(20)</b>, <b>SMA(50)</b>, <b>EMA(20)</b>, <b>RSI(14)</b>, <b>MACD(12,26,9)</b>.
        </p>

        {err && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {err}
          </div>
        )}
      </section>

      {/* Top strip: quote & profile */}
      {quote && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <div className="flex items-center gap-4">
              {profile?.image && (
                <img
                  src={profile.image}
                  alt=""
                  className="h-10 w-10 rounded border bg-white object-contain"
                />
              )}
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  {quote.symbol}{" "}
                  <span className="text-sm text-gray-500">{profile?.companyName || ""}</span>
                </div>
                <div className="text-sm text-gray-600">
                  {profile?.sector ? `${profile.sector} • ${profile.industry ?? ""}` : ""}
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-2xl font-bold text-gray-900">
                  {typeof quote.price === "number" ? quote.price.toFixed(2) : "—"}
                </div>
                <div className={`text-sm ${pctColor(quote.changesPercentage)}`}>
                  {typeof quote.change === "number" ? (quote.change >= 0 ? "+" : "") + quote.change.toFixed(2) : "—"}{" "}
                  ({typeof quote.changesPercentage === "number" ? quote.changesPercentage.toFixed(2) + "%" : "—"})
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-3">
              <div><span className="text-gray-500">Open:</span> <span className="font-medium text-gray-900">{n(quote.open)}</span></div>
              <div><span className="text-gray-500">Prev Close:</span> <span className="font-medium text-gray-900">{n(quote.previousClose)}</span></div>
              <div><span className="text-gray-500">Day Low/High:</span> <span className="font-medium text-gray-900">{n(quote.dayLow)} / {n(quote.dayHigh)}</span></div>
              <div><span className="text-gray-500">52w Low/High:</span> <span className="font-medium text-gray-900">{n(quote.yearLow)} / {n(quote.yearHigh)}</span></div>
              <div><span className="text-gray-500">Volume/Avg:</span> <span className="font-medium text-gray-900">{num(quote.volume)} / {num(quote.avgVolume ?? profile?.volAvg)}</span></div>
              <div><span className="text-gray-500">Market Cap:</span> <span className="font-medium text-gray-900">{num(quote.marketCap ?? profile?.mktCap)}</span></div>
            </div>
          </div>
        </section>
      )}

      {/* Charts */}
      {bars.length > 0 && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          {/* Price + MAs */}
          <div className="text-sm font-medium text-gray-900 mb-2">Price & MAs</div>
          <div className="rounded-lg border p-3 overflow-x-auto">
            <div className="min-w-[720px]">
              <Polyline series={closes} width={720} height={180} stroke="#0f172a" strokeWidth={2} />
              <div className="-mt-[180px] pointer-events-none">
                <Polyline series={sma20} width={720} height={180} stroke="#2563eb" strokeWidth={1.5} />
                <Polyline series={sma50} width={720} height={180} stroke="#7c3aed" strokeWidth={1.5} />
                <Polyline series={ema20} width={720} height={180} stroke="#10b981" strokeWidth={1.5} />
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-600">Blue=SMA20, Purple=SMA50, Green=EMA20.</div>

          {/* RSI */}
          <div className="mt-6 text-sm font-medium text-gray-900 mb-2">RSI(14)</div>
          <div className="rounded-lg border p-3 overflow-x-auto">
            <div className="min-w-[720px] relative">
              <Polyline series={rsi14} width={720} height={100} stroke="#374151" strokeWidth={1.5} />
              {/* 30/70 guides */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-0 right-0 top-[30%] border-t border-dashed border-gray-300" />
                <div className="absolute left-0 right-0 top-[70%] border-t border-dashed border-gray-300" />
              </div>
            </div>
          </div>

          {/* MACD */}
          <div className="mt-6 text-sm font-medium text-gray-900 mb-2">MACD(12,26,9)</div>
          <div className="rounded-lg border p-3 overflow-x-auto">
            <div className="min-w-[720px]">
              <Polyline series={macd.macd} width={720} height={120} stroke="#0ea5e9" strokeWidth={1.5} />
              <div className="-mt-[120px] pointer-events-none">
                <Polyline series={macd.signal} width={720} height={120} stroke="#ef4444" strokeWidth={1.5} />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Company blurb */}
      {profile?.description && (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          <div className="text-sm font-medium text-gray-900 mb-2">About</div>
          <p className="text-sm text-gray-700 leading-relaxed">
            {profile.description}
          </p>
        </section>
      )}
    </div>
  );
}