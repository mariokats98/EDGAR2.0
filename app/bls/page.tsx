// app/bls/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

/* =========================
   Friendly indicator registry
   ========================= */
type IndicatorKey = "CPI" | "UNRATE" | "PAYROLLS" | "AHE" | "PRODUCTIVITY";

const INDICATORS: Record<
  IndicatorKey,
  {
    id: string;
    label: string;
    unitsHint: string;
    seasonal: "SA" | "NSA";
    fmt: (n: number) => string;
  }
> = {
  CPI: {
    id: "CUUR0000SA0",
    label: "Consumer Price Index (All items, SA)",
    unitsHint: "Index (1982–84=100)",
    seasonal: "SA",
    fmt: (n) => n.toFixed(1),
  },
  UNRATE: {
    id: "LNS14000000",
    label: "Unemployment Rate",
    unitsHint: "Percent",
    seasonal: "SA",
    fmt: (n) => `${n.toFixed(1)}%`,
  },
  PAYROLLS: {
    id: "CES0000000001",
    label: "Nonfarm Payroll Employment",
    unitsHint: "Thousands",
    seasonal: "SA",
    fmt: (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 }),
  },
  AHE: {
    id: "CES0500000003",
    label: "Average Hourly Earnings (Total private)",
    unitsHint: "Dollars",
    seasonal: "SA",
    fmt: (n) => `$${n.toFixed(2)}`,
  },
  PRODUCTIVITY: {
    id: "PRS85006093",
    label: "Labor Productivity (Nonfarm Business)",
    unitsHint: "Index (2017=100), Quarterly",
    seasonal: "SA",
    fmt: (n) => n.toFixed(1),
  },
};

type SeriesObs = { date: string; value: number };
type SeriesOut = {
  id: string;
  title: string;
  units: string;
  seasonal: "SA" | "NSA";
  observations: SeriesObs[];
  latest?: SeriesObs | null;
};

/* ============ Date utils (robust for BLS) ============ */

// Accepts "YYYY", "YYYY-MM", "YYYY-M01", "YYYY-Q1"
function parseAnyDateKey(s: string): Date {
  // YYYY-Qn
  let m = s.match(/^(\d{4})-Q([1-4])$/i);
  if (m) {
    const y = +m[1], q = +m[2];
    const month = (q - 1) * 3; // 0,3,6,9
    return new Date(y, month, 1);
  }
  // YYYY-Mnn
  m = s.match(/^(\d{4})-M(0[1-9]|1[0-2])$/i);
  if (m) return new Date(+m[1], +m[2] - 1, 1);
  // YYYY-MM
  m = s.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (m) return new Date(+m[1], +m[2] - 1, 1);
  // YYYY
  m = s.match(/^(\d{4})$/);
  if (m) return new Date(+m[1], 0, 1);
  // Fallback guard
  const d = new Date(s);
  return isNaN(+d) ? new Date(1970, 0, 1) : d;
}

function sortChrono(obs: SeriesObs[]) {
  return [...obs].sort((a, b) => +parseAnyDateKey(a.date) - +parseAnyDateKey(b.date));
}

function uniqAscending(obs: SeriesObs[]) {
  const map = new Map<string, number>();
  for (const o of obs) map.set(o.date, o.value);
  return sortChrono(Array.from(map, ([date, value]) => ({ date, value })));
}

function monthsBetween(a: string, b: string) {
  const A = parseAnyDateKey(a), B = parseAnyDateKey(b);
  return (B.getFullYear() - A.getFullYear()) * 12 + (B.getMonth() - A.getMonth());
}

function inferCadenceMonths(obs: SeriesObs[]): 1 | 3 | 12 {
  const s = sortChrono(obs);
  if (s.length < 3) return 1;
  const gaps: number[] = [];
  for (let i = 1; i < Math.min(s.length, 12); i++) {
    gaps.push(Math.max(1, monthsBetween(s[i - 1].date, s[i].date)));
  }
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (avg > 8) return 12; // annual-ish
  if (avg > 2) return 3;  // quarterly-ish
  return 1;               // monthly-ish
}

function labelForX(dateStr: string, cadenceMonths: 1 | 3 | 12) {
  const d = parseAnyDateKey(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (cadenceMonths === 12) return `${y}`;
  if (cadenceMonths === 3) {
    const q = Math.floor((m - 1) / 3) + 1;
    return `${y}-Q${q}`;
  }
  return d.toLocaleString(undefined, { year: "numeric", month: "short" }); // e.g., "Jan 2024"
}

function prettyDate(dateStr: string, cadenceMonths: 1 | 3 | 12) {
  return labelForX(dateStr, cadenceMonths);
}

/* ============ Deltas & formatting ============ */
function deltas(obs: SeriesObs[]) {
  const s = sortChrono(obs);
  if (s.length < 2) return { shortLabel: "MoM", short: null as number | null, yoy: null as number | null };
  const cadence = inferCadenceMonths(s);
  const last = s[s.length - 1].value;
  const prev = s[s.length - 2]?.value;
  const short = prev ? ((last - prev) / prev) * 100 : null;
  const shortLabel = cadence === 3 ? "QoQ" : cadence === 12 ? "YoY" : "MoM";
  const perYear = Math.max(1, Math.round(12 / cadence));
  const idx = s.length - 1 - perYear;
  const yoy = idx >= 0 && s[idx].value ? ((last - s[idx].value) / s[idx].value) * 100 : null;
  return { shortLabel, short, yoy };
}

function fmtPct(p: number | null) {
  if (p == null || !isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

/* ============ Chart (improved) ============ */
function LineChart({
  data,
  height = 170,
  pad = 12,
  xTicksTarget = 8,
}: {
  data: SeriesObs[];
  height?: number;
  pad?: number;
  xTicksTarget?: number;
}) {
  const s = sortChrono(data);
  if (s.length < 2) return null;

  const width = 600;
  const ys = s.map((d) => d.value);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const nicePad = (maxY - minY) * 0.08;
  const y0 = minY - nicePad;
  const y1 = maxY + nicePad;

  const dx = (width - pad * 2) / (s.length - 1);
  const scaleY = (v: number) =>
    y1 === y0 ? height / 2 : height - pad - ((v - y0) / (y1 - y0)) * (height - pad * 2);

  // Path & area
  let d = `M ${pad},${scaleY(ys[0])}`;
  for (let i = 1; i < s.length; i++) d += ` L ${pad + i * dx},${scaleY(ys[i])}`;
  const area = `${d} L ${width - pad},${height - pad} L ${pad},${height - pad} Z`;

  // X ticks
  const cadence = inferCadenceMonths(s);
  const tickCount = Math.min(xTicksTarget, s.length);
  const step = Math.max(1, Math.round((s.length - 1) / (tickCount - 1)));
  const tickIdxs: number[] = [];
  for (let i = 0; i < s.length; i += step) tickIdxs.push(i);
  if (tickIdxs[tickIdxs.length - 1] !== s.length - 1) tickIdxs.push(s.length - 1);

  // Y “nice” ticks
  const yTicks = [y0, (y0 + y1) / 2, y1];

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="trend chart">
      {/* horizontal grid */}
      {Array.from({ length: 5 }).map((_, i) => {
        const y = pad + ((height - pad * 2) / 4) * i;
        return <line key={`hy${i}`} x1={pad} y1={y} x2={width - pad} y2={y} stroke="#e5e7eb" />;
      })}
      {/* vertical grid at tick positions */}
      {tickIdxs.map((idx, i) => {
        const x = pad + idx * dx;
        return <line key={`vx${i}`} x1={x} y1={pad} x2={x} y2={height - pad} stroke="#f0f0f0" />;
      })}
      {/* axes */}
      <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill="none" stroke="#d1d5db" />

      {/* area + line */}
      <path d={area} fill="rgba(31,41,55,0.06)" />
      <path d={d} fill="none" stroke="#0f172a" strokeWidth={2} />

      {/* endpoints */}
      <circle cx={pad} cy={scaleY(ys[0])} r={2.6} fill="#0f172a" />
      <circle cx={width - pad} cy={scaleY(ys[ys.length - 1])} r={2.6} fill="#0f172a" />

      {/* y labels */}
      <text x={pad + 4} y={pad + 10} fontSize="10" fill="#6b7280">{yTicks[2].toFixed(2)}</text>
      <text x={pad + 4} y={height / 2 + 3} fontSize="10" fill="#6b7280">{yTicks[1].toFixed(2)}</text>
      <text x={pad + 4} y={height - pad - 2} fontSize="10" fill="#6b7280">{yTicks[0].toFixed(2)}</text>

      {/* x labels */}
      {tickIdxs.map((idx, i) => {
        const x = pad + idx * dx;
        return (
          <text key={`xl${i}`} x={x - 18} y={height - 2} fontSize="10" fill="#6b7280">
            {labelForX(s[idx].date, cadence)}
          </text>
        );
      })}
    </svg>
  );
}

/* ============ Page component ============ */
type Tab = "latest" | "trends";

type BlsNews = { title: string; link: string; pubDate: string; category?: string };

export default function BLSPage() {
  const thisYear = new Date().getFullYear().toString();

  // Tabs
  const [tab, setTab] = useState<Tab>("latest");

  // Latest
  const [activeKey, setActiveKey] = useState<IndicatorKey>("CPI");
  const [latestMonths, setLatestMonths] = useState(24);
  const [latestLoading, setLatestLoading] = useState(false);
  const [latestSeries, setLatestSeries] = useState<SeriesOut | null>(null);
  const [latestError, setLatestError] = useState<string | null>(null);

  // Trends
  const [pickedKeys, setPickedKeys] = useState<IndicatorKey[]>(["CPI", "UNRATE"]);
  const [start, setStart] = useState("1999");
  const [end, setEnd] = useState(thisYear);
  const [freq, setFreq] = useState<"monthly" | "annual">("monthly");
  const [trLoading, setTrLoading] = useState(false);
  const [trSeries, setTrSeries] = useState<SeriesOut[]>([]);
  const [trError, setTrError] = useState<string | null>(null);

  // BLS Economic News Releases
  const [news, setNews] = useState<BlsNews[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsQuery, setNewsQuery] = useState("");

  useEffect(() => {
    if (tab === "latest" && !latestSeries && !latestLoading) {
      void loadLatest(activeKey, latestMonths);
    }
    // also load news once
    if (news.length === 0 && !newsLoading) {
      void loadNews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function keyToIds(keys: IndicatorKey[]) {
    return keys.map((k) => INDICATORS[k].id).join(",");
  }

  function normalizeSeries(s?: SeriesOut, keepLastPoints?: number): SeriesOut | null {
    if (!s) return null;
    const asc = uniqAscending(s.observations); // old → new
    let obs = asc;
    if (keepLastPoints && keepLastPoints > 0) obs = asc.slice(-keepLastPoints);
    return { ...s, observations: obs, latest: obs[obs.length - 1] ?? null };
  }

  async function loadLatest(key: IndicatorKey, points: number) {
    setActiveKey(key);
    setLatestLoading(true);
    setLatestError(null);
    setLatestSeries(null);
    try {
      const endYear = new Date().getFullYear();
      const startYear = Math.max(1980, endYear - Math.ceil(points / 12) - 1);
      const qs = new URLSearchParams({
        ids: INDICATORS[key].id,
        start: String(startYear),
        end: String(endYear),
        freq: "monthly",
      });
      const r = await fetch(`/api/bls/series?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch");
      const norm = normalizeSeries((j.data || [])[0], points);
      if (!norm) throw new Error("No data");
      setLatestSeries(norm);
    } catch (e: any) {
      setLatestError(e?.message || "Error");
    } finally {
      setLatestLoading(false);
    }
  }

  function toggleKey(k: IndicatorKey) {
    setPickedKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  async function loadTrends() {
    setTrLoading(true);
    setTrError(null);
    setTrSeries([]);
    try {
      const ids = keyToIds(pickedKeys);
      if (!ids) { setTrError("Pick at least one indicator."); setTrLoading(false); return; }
      const qs = new URLSearchParams({ ids, start, end, freq });
      const r = await fetch(`/api/bls/series?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch");
      const data: SeriesOut[] = (j.data || [])
        .map((s: SeriesOut) => normalizeSeries(s)!)
        .filter(Boolean);
      setTrSeries(data);
    } catch (e: any) {
      setTrError(e?.message || "Error");
    } finally {
      setTrLoading(false);
    }
  }

  /* ---------- BLS News ---------- */
  async function loadNews() {
    setNewsLoading(true);
    try {
      const r = await fetch(`/api/bls/news?limit=24`, { cache: "no-store" });
      const j = await r.json();
      setNews(Array.isArray(j.items) ? j.items : []);
    } catch {
      setNews([]);
    } finally {
      setNewsLoading(false);
    }
  }

  const filteredNews = useMemo(() => {
    const q = newsQuery.trim().toLowerCase();
    if (!q) return news;
    return news.filter((n) =>
      [n.title, n.category].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [news, newsQuery]);

  /* ---------- Cards ---------- */
  function LatestCard() {
    if (latestError) return <div className="text-red-600 text-sm">Error: {latestError}</div>;
    if (latestLoading || !latestSeries) return <div className="text-sm text-gray-600">Loading…</div>;
    const meta = latestSeries;
    const key = activeKey;
    const units = meta.units || INDICATORS[key].unitsHint;
    const last = meta.latest;
    const cadence = inferCadenceMonths(meta.observations);
    const { shortLabel, short, yoy } = deltas(meta.observations);
    return (
      <div className="rounded-2xl border bg-white p-4">
        <div className="text-sm font-medium">{INDICATORS[key].label}</div>
        <div className="text-xs text-gray-600">Units: {units}</div>
        {last && (
          <div className="text-2xl font-semibold mt-2">
            {INDICATORS[key].fmt(last.value)}{" "}
            <span className="text-sm text-gray-500">({prettyDate(last.date, cadence)})</span>
          </div>
        )}
        <div className="flex flex-wrap gap-3 text-xs mt-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5">{shortLabel}: <strong>{fmtPct(short)}</strong></span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5">YoY: <strong>{fmtPct(yoy)}</strong></span>
        </div>
        <div className="mt-4 text-gray-900">
          <LineChart data={meta.observations} />
        </div>
      </div>
    );
  }

  const trendCards = useMemo(() =>
    trSeries.map((s) => {
      const match = (Object.keys(INDICATORS) as IndicatorKey[]).find(k => INDICATORS[k].id === s.id);
      const label = match ? INDICATORS[match].label : s.title || s.id;
      const units = match ? INDICATORS[match].unitsHint : s.units || "—";
      const fmt = match ? INDICATORS[match].fmt : (n: number) => n.toFixed(2);
      const last = s.latest;
      const cadence = inferCadenceMonths(s.observations);
      const { shortLabel, short, yoy } = deltas(s.observations);
      return (
        <div key={s.id} className="rounded-2xl border bg-white p-4">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-gray-600">Units: {units}</div>
          {last && (
            <div className="text-xs mt-1">
              Latest: <span className="font-semibold">{fmt(last.value)}</span> on {prettyDate(last.date, cadence)}
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-xs mt-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5">{shortLabel}: <strong>{fmtPct(short)}</strong></span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5">YoY: <strong>{fmtPct(yoy)}</strong></span>
          </div>
          <div className="mt-4 text-gray-900">
            <LineChart data={s.observations} />
          </div>
        </div>
      );
    })
  , [trSeries]);

  /* ---------- Render ---------- */
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">BLS Economic Data</h1>
      <p className="text-gray-600 text-sm mb-4">Latest numbers at a glance, plus clean historical trends.</p>

      {/* NEW: Economic News Releases */}
      <section className="rounded-2xl border bg-white p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Economic News Releases</h2>
          <div className="flex items-center gap-2">
            <input
              value={newsQuery}
              onChange={(e) => setNewsQuery(e.target.value)}
              placeholder="Filter headlines (e.g., CPI, productivity)…"
              className="border rounded-md px-3 py-1.5 text-sm w-64"
            />
            <button
              onClick={loadNews}
              className="px-3 py-1.5 rounded-md bg-black text-white text-sm disabled:opacity-60"
              disabled={newsLoading}
            >
              {newsLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-3 grid md:grid-cols-2 gap-3">
          {filteredNews.map((n, i) => (
            <article key={i} className="border rounded-lg p-3">
              <a href={n.link} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {n.title}
              </a>
              <div className="text-xs text-gray-600 mt-1">
                {n.category && <span className="rounded-full bg-gray-100 px-2 py-0.5 mr-2">{n.category}</span>}
                {n.pubDate ? new Date(n.pubDate).toLocaleString() : ""}
              </div>
              <div className="mt-2">
                <a href={n.link} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                  Read on bls.gov →
                </a>
              </div>
            </article>
          ))}
          {(!newsLoading && filteredNews.length === 0) && (
            <div className="text-sm text-gray-600">No matching headlines.</div>
          )}
          {newsLoading && filteredNews.length === 0 && (
            <div className="text-sm text-gray-600">Loading BLS headlines…</div>
          )}
        </div>
      </section>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        <button
          className={`px-3 py-2 text-sm rounded-md border ${tab === "latest" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"}`}
          onClick={() => setTab("latest")}
        >
          Latest Numbers
        </button>
        <button
          className={`px-3 py-2 text-sm rounded-md border ${tab === "trends" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"}`}
          onClick={() => setTab("trends")}
        >
          Trends
        </button>
      </div>

      {/* LATEST */}
      {tab === "latest" && (
        <section className="rounded-2xl border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(INDICATORS) as IndicatorKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => loadLatest(k, latestMonths)}
                  className={`text-xs rounded-full px-3 py-1 border ${k === activeKey ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"}`}
                  title={INDICATORS[k].label}
                >
                  {INDICATORS[k].label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-700">Show last</label>
              <select
                value={latestMonths}
                onChange={(e) => setLatestMonths(parseInt(e.target.value))}
                className="border rounded-md px-2 py-1 text-sm"
              >
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
                <option value={60}>5 years</option>
                <option value={120}>10 years</option>
              </select>
              <button
                onClick={() => loadLatest(activeKey, latestMonths)}
                className="px-3 py-1 rounded-md bg-black text-white text-sm disabled:opacity-60"
                disabled={latestLoading}
              >
                Latest Number
              </button>
            </div>
          </div>

          <div className="mt-4">
            <LatestCard />
          </div>
        </section>
      )}

      {/* TRENDS */}
      {tab === "trends" && (
        <section className="grid md:grid-cols-[260px_1fr] gap-4">
          {/* Left: picker */}
          <aside className="rounded-2xl border bg-white p-4 h-fit">
            <div className="font-medium mb-2">Pick indicators</div>
            <div className="space-y-2">
              {(Object.keys(INDICATORS) as IndicatorKey[]).map((k) => {
                const checked = pickedKeys.includes(k);
                return (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked} onChange={() => toggleKey(k)} />
                    <span>{INDICATORS[k].label}</span>
                  </label>
                );
              })}
            </div>
            <div className="text-xs text-gray-600 mt-3">Note: Productivity is quarterly; others are monthly.</div>
          </aside>

          {/* Right: controls + charts */}
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label>
                <div className="text-sm text-gray-700">Start year</div>
                <input value={start} onChange={(e) => setStart(e.target.value)} className="border rounded-md px-3 py-2 w-28" />
              </label>
              <label>
                <div className="text-sm text-gray-700">End year</div>
                <input value={end} onChange={(e) => setEnd(e.target.value)} className="border rounded-md px-3 py-2 w-28" />
              </label>
              <label>
                <div className="text-sm text-gray-700">Frequency</div>
                <select value={freq} onChange={(e) => setFreq(e.target.value as "monthly" | "annual")} className="border rounded-md px-3 py-2">
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual Avg</option>
                </select>
              </label>
              <button onClick={loadTrends} className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60" disabled={trLoading}>
                Get data
              </button>
            </div>

            {trError && <div className="text-red-600 text-sm mt-3">Error: {trError}</div>}

            <div className="mt-4 grid gap-4">
              {trendCards}
              {!trLoading && trSeries.length === 0 && (
                <div className="text-sm text-gray-600">Select indicators, set dates, then click “Get data”.</div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
