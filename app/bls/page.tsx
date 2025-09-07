"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * BLS Dashboard — polished
 * - Plain-English labels (no raw series codes in UI)
 * - Chronological sorting & correct cadence (MoM vs QoQ vs YoY)
 * - Nicer SVG charts: grid, axes, min/mid/max
 * - Value formatting per indicator
 * Uses your /api/bls/series endpoint.
 */

/* Curated indicators */
type IndicatorKey = "CPI" | "UNRATE" | "PAYROLLS" | "AHE" | "PRODUCTIVITY";

const INDICATORS: Record<
  IndicatorKey,
  {
    id: string;
    label: string;            // UI label
    unitsHint: string;        // fallback units if API lacks it
    seasonal: "SA" | "NSA";
    fmt: (n: number) => string; // pretty formatter
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
    fmt: (n) => formatNumber(n, 0), // already in thousands
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

type SeriesObs = { date: string; value: number }; // date "YYYY-MM" or "YYYY"
type SeriesOut = {
  id: string;
  title: string;
  units: string;
  seasonal: "SA" | "NSA";
  observations: SeriesObs[];
  latest?: SeriesObs | null;
};

/* ---------- Utilities ---------- */

function formatNumber(n: number, decimals = 0) {
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function parseDateKey(d: string) {
  // Accept "YYYY" or "YYYY-MM" or "YYYY-MM-DD"
  const [y, m = "01", dd = "01"] = d.split("-");
  return new Date(+y, +m - 1, +dd);
}

function sortChrono(obs: SeriesObs[]) {
  return [...obs].sort((a, b) => +parseDateKey(a.date) - +parseDateKey(b.date));
}

function uniqAscending(obs: SeriesObs[]) {
  // Remove duplicates by date (keep last), then sort
  const map = new Map<string, number>();
  for (const o of obs) map.set(o.date, o.value);
  const out = Array.from(map.entries()).map(([date, value]) => ({ date, value }));
  return sortChrono(out);
}

function monthsBetween(a: string, b: string) {
  const A = parseDateKey(a), B = parseDateKey(b);
  return (B.getFullYear() - A.getFullYear()) * 12 + (B.getMonth() - A.getMonth());
}

function inferCadenceMonths(obs: SeriesObs[]) {
  const s = sortChrono(obs);
  if (s.length < 3) return 1;
  const deltas: number[] = [];
  for (let i = 1; i < Math.min(s.length, 8); i++) {
    deltas.push(Math.max(1, monthsBetween(s[i - 1].date, s[i].date)));
  }
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  // Snap to common cadences
  if (avg > 8) return 12; // annual-ish
  if (avg > 2) return 3;  // quarterly-ish
  return 1;               // monthly-ish
}

function deltas(obs: SeriesObs[]) {
  const s = sortChrono(obs);
  if (s.length < 2) return { shortLabel: "MoM", short: null as number | null, yoy: null as number | null };
  const cadence = inferCadenceMonths(s);
  const last = s[s.length - 1].value;
  const prev = s[s.length - 2]?.value;
  const short = prev ? ((last - prev) / prev) * 100 : null; // MoM or QoQ or YoY if annual
  const shortLabel = cadence === 3 ? "QoQ" : cadence === 12 ? "YoY" : "MoM";
  const periodsPerYear = Math.max(1, Math.round(12 / cadence));
  const idx = s.length - 1 - periodsPerYear;
  const yoy = idx >= 0 && s[idx].value ? ((last - s[idx].value) / s[idx].value) * 100 : null;
  return { shortLabel, short, yoy };
}

function fmtPct(p: number | null) {
  if (p == null || !isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

/* ---------- Chart ---------- */
function LineChart({
  data,
  height = 150,
  pad = 10,
  gridLines = 4,
}: {
  data: SeriesObs[];
  height?: number;
  pad?: number;
  gridLines?: number;
}) {
  const s = sortChrono(data);
  if (s.length < 2) return null;

  const width = 520;
  const ys = s.map((d) => d.value);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const nicePad = (maxY - minY) * 0.05;
  const y0 = minY - nicePad;
  const y1 = maxY + nicePad;

  const xs = s.map((_, i) => i);
  const dx = (width - pad * 2) / (xs.length - 1);
  const scaleY = (v: number) => {
    if (y1 === y0) return height / 2;
    return height - pad - ((v - y0) / (y1 - y0)) * (height - pad * 2);
  };

  const d = xs
    .map((_, i) => `${i === 0 ? "M" : "L"} ${pad + i * dx},${scaleY(ys[i])}`)
    .join(" ");
  const area = `${d} L ${width - pad},${height - pad} L ${pad},${height - pad} Z`;

  // y ticks (min/mid/max)
  const ticks = [y0, (y0 + y1) / 2, y1];

  const first = s[0].date;
  const last = s[s.length - 1].date;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img">
      {/* grid */}
      {Array.from({ length: gridLines + 1 }).map((_, i) => {
        const y = pad + ((height - pad * 2) / gridLines) * i;
        return <line key={i} x1={pad} y1={y} x2={width - pad} y2={y} stroke="#e5e7eb" />;
      })}
      {/* axis box */}
      <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill="none" stroke="#d1d5db" />
      {/* area + line */}
      <path d={area} fill="rgba(31, 41, 55, 0.06)" />
      <path d={d} fill="none" stroke="#111827" strokeWidth={2} />
      {/* start/end dots */}
      <circle cx={pad} cy={scaleY(ys[0])} r={2.5} fill="#111827" />
      <circle cx={width - pad} cy={scaleY(ys[ys.length - 1])} r={2.5} fill="#111827" />
      {/* y labels */}
      <text x={pad + 4} y={pad + 10} fontSize="10" fill="#6b7280">{ticks[2].toFixed(2)}</text>
      <text x={pad + 4} y={(height) / 2 + 3} fontSize="10" fill="#6b7280">{ticks[1].toFixed(2)}</text>
      <text x={pad + 4} y={height - pad - 2} fontSize="10" fill="#6b7280">{ticks[0].toFixed(2)}</text>
      {/* x labels */}
      <text x={pad} y={height - 2} fontSize="10" fill="#6b7280">{first}</text>
      <text x={width - pad - 45} y={height - 2} fontSize="10" fill="#6b7280">{last}</text>
    </svg>
  );
}

/* ---------- Component ---------- */
type Tab = "latest" | "trends";

export default function BLSPage() {
  const thisYear = new Date().getFullYear().toString();

  // Tabs
  const [tab, setTab] = useState<Tab>("latest");

  // Latest Numbers
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

  // load first time
  useEffect(() => {
    if (tab === "latest" && !latestSeries && !latestLoading) {
      void loadLatest(activeKey, latestMonths);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function keyToIds(keys: IndicatorKey[]) {
    return keys.map((k) => INDICATORS[k].id).join(",");
  }

  // Ensure data are chronological, formatted, and sliced to last N months
  function normalizeSeries(s?: SeriesOut, months?: number): SeriesOut | null {
    if (!s) return null;
    const obs = uniqAscending(s.observations);
    const out = { ...s, observations: obs, latest: obs[obs.length - 1] ?? null };
    if (months && months > 0) {
      const tail = obs.slice(-months);
      return { ...out, observations: tail, latest: tail[tail.length - 1] ?? out.latest };
    }
    return out;
  }

  async function loadLatest(key: IndicatorKey, months: number) {
    setActiveKey(key);
    setLatestLoading(true);
    setLatestError(null);
    setLatestSeries(null);
    try {
      const endYear = new Date().getFullYear();
      const startYear = Math.max(1980, endYear - Math.ceil(months / 12) - 1); // historical buffer
      const qs = new URLSearchParams({
        ids: INDICATORS[key].id,
        start: String(startYear),
        end: String(endYear),
        freq: "monthly",
      });
      const r = await fetch(`/api/bls/series?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch");
      const norm = normalizeSeries((j.data || [])[0], months);
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
      if (!ids) {
        setTrError("Pick at least one indicator.");
        setTrLoading(false);
        return;
      }
      const qs = new URLSearchParams({ ids, start, end, freq });
      const r = await fetch(`/api/bls/series?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch");
      const data: SeriesOut[] = (j.data || []).map((s: SeriesOut) => normalizeSeries(s)!).filter(Boolean);
      setTrSeries(data);
    } catch (e: any) {
      setTrError(e?.message || "Error");
    } finally {
      setTrLoading(false);
    }
  }

  /* ---------- UI pieces ---------- */

  function LatestCard() {
    if (latestError) return <div className="text-red-600 text-sm">Error: {latestError}</div>;
    if (latestLoading || !latestSeries) return <div className="text-sm text-gray-600">Loading…</div>;

    const meta = latestSeries;
    const key = activeKey;
    const friendly = INDICATORS[key].label;
    const units = meta.units || INDICATORS[key].unitsHint;
    const last = meta.latest;
    const { shortLabel, short, yoy } = deltas(meta.observations);

    return (
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">{friendly}</div>
            <div className="text-xs text-gray-600">Units: {units}</div>
            {last && (
              <div className="text-2xl font-semibold mt-2">
                {INDICATORS[key].fmt(last.value)}{" "}
                <span className="text-sm text-gray-500">({last.date})</span>
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-xs mt-2">
              <span className="rounded-full bg-gray-100 px-2 py-0.5">
                {shortLabel}: <strong>{fmtPct(short)}</strong>
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5">
                YoY: <strong>{fmtPct(yoy)}</strong>
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 text-gray-800">
          <LineChart data={meta.observations} />
        </div>
      </div>
    );
  }

  const trendCards = useMemo(
    () =>
      trSeries.map((s) => {
        const match = (Object.keys(INDICATORS) as IndicatorKey[]).find(
          (k) => INDICATORS[k].id === s.id
        );
        const friendly = match ? INDICATORS[match].label : s.title || s.id;
        const units = match ? INDICATORS[match].unitsHint : s.units || "—";
        const fmt = match ? INDICATORS[match].fmt : (n: number) => n.toFixed(2);

        const last = s.latest;
        const { shortLabel, short, yoy } = deltas(s.observations);

        return (
          <div key={s.id} className="rounded-2xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{friendly}</div>
                <div className="text-xs text-gray-600">Units: {units}</div>
                {last && (
                  <div className="text-xs mt-1">
                    Latest: <span className="font-semibold">{fmt(last.value)}</span> on {last.date}
                  </div>
                )}
                <div className="flex flex-wrap gap-3 text-xs mt-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5">
                    {shortLabel}: <strong>{fmtPct(short)}</strong>
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5">
                    YoY: <strong>{fmtPct(yoy)}</strong>
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 text-gray-800">
              <LineChart data={s.observations} />
            </div>
          </div>
        );
      }),
    [trSeries]
  );

  /* ---------- Render ---------- */
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">BLS Economic Data</h1>
      <p className="text-gray-600 text-sm mb-4">
        Latest numbers at a glance, plus clean historical trends.
      </p>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        <button
          className={`px-3 py-2 text-sm rounded-md border ${
            tab === "latest" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"
          }`}
          onClick={() => setTab("latest")}
        >
          Latest Numbers
        </button>
        <button
          className={`px-3 py-2 text-sm rounded-md border ${
            tab === "trends" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"
          }`}
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
                  className={`text-xs rounded-full px-3 py-1 border ${
                    k === activeKey ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"
                  }`}
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
            <div className="text-xs text-gray-600 mt-3">
              Note: Productivity is quarterly; others are monthly.
            </div>
          </aside>

          {/* Right: controls + results */}
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label>
                <div className="text-sm text-gray-700">Start year</div>
                <input
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="border rounded-md px-3 py-2 w-28"
                />
              </label>
              <label>
                <div className="text-sm text-gray-700">End year</div>
                <input
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="border rounded-md px-3 py-2 w-28"
                />
              </label>
              <label>
                <div className="text-sm text-gray-700">Frequency</div>
                <select
                  value={freq}
                  onChange={(e) => setFreq(e.target.value as "monthly" | "annual")}
                  className="border rounded-md px-3 py-2"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual Avg</option>
                </select>
              </label>
              <button
                onClick={loadTrends}
                className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60"
                disabled={trLoading}
              >
                Get data
              </button>
            </div>

            {trError && <div className="text-red-600 text-sm mt-3">Error: {trError}</div>}

            <div className="mt-4 grid gap-4">
              {trendCards}
              {!trLoading && trSeries.length === 0 && (
                <div className="text-sm text-gray-600">
                  Select indicators, set dates, then click “Get data”.
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
