"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * BLS Dashboard (enhanced)
 * - Tab 1: Latest Numbers (quick buttons + latest print + trend)
 * - Tab 2: Trends (pick indicators, date range, full charts)
 * - Adds YoY + MoM/QoQ deltas and CSV export
 * Uses /api/bls/series for data, no external chart libs (SVG).
 */

/* ---- Curated indicators (reliable series IDs) ----
   CPI-U All Items (SA):            CUUR0000SA0
   Unemployment Rate (SA):          LNS14000000
   Nonfarm Payroll Employment (SA): CES0000000001 (Thousands)
   Avg Hourly Earnings, Total Pvt:  CES0500000003 (Dollars)
   Nonfarm Business Productivity:   PRS85006093 (Index 2017=100, quarterly)
*/
type IndicatorKey = "CPI" | "UNRATE" | "PAYROLLS" | "AHE" | "PRODUCTIVITY";
const INDICATORS: Record<
  IndicatorKey,
  { id: string; label: string; unitsHint: string; seasonal: "SA" | "NSA" }
> = {
  CPI:          { id: "CUUR0000SA0",   label: "CPI (All Items, SA)",                   unitsHint: "Index 1982-84=100", seasonal: "SA" },
  UNRATE:       { id: "LNS14000000",   label: "Unemployment Rate (SA)",                unitsHint: "Percent",           seasonal: "SA" },
  PAYROLLS:     { id: "CES0000000001", label: "Nonfarm Payroll Employment (SA)",       unitsHint: "Thousands",         seasonal: "SA" },
  AHE:          { id: "CES0500000003", label: "Average Hourly Earnings — Private",     unitsHint: "Dollars",           seasonal: "SA" },
  PRODUCTIVITY: { id: "PRS85006093",   label: "Labor Productivity — Nonfarm Business", unitsHint: "Index 2017=100",    seasonal: "SA" },
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

/* ---------- Tiny SVG chart ---------- */
function LineChart({
  data,
  height = 120,
  strokeWidth = 2,
  showAxis = true,
  pad = 8,
}: {
  data: SeriesObs[];
  height?: number;
  strokeWidth?: number;
  showAxis?: boolean;
  pad?: number;
}) {
  if (!data || data.length < 2) return null;
  const width = 480;
  const xs = data.map((_, i) => i);
  const ys = data.map((d) => d.value);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const dx = (width - pad * 2) / (xs.length - 1);
  const scaleY = (v: number) =>
    maxY === minY
      ? height / 2
      : height - pad - ((v - minY) / (maxY - minY)) * (height - pad * 2);
  const path = xs
    .map((_, i) => `${i === 0 ? "M" : "L"} ${pad + i * dx},${scaleY(ys[i])}`)
    .join(" ");

  const last = data[data.length - 1];
  const first = data[0];

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="trend chart">
      {showAxis && (
        <>
          <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#e5e7eb" />
          <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#e5e7eb" />
        </>
      )}
      <path d={path} fill="none" stroke="currentColor" strokeWidth={strokeWidth} />
      {/* start/end dots */}
      <circle cx={pad} cy={scaleY(ys[0])} r={2.5} />
      <circle cx={width - pad} cy={scaleY(ys[ys.length - 1])} r={2.5} />
      {/* simple labels */}
      <text x={pad} y={pad + 10} fontSize="10" fill="#6b7280">
        {first.date}
      </text>
      <text x={width - pad - 50} y={pad + 10} fontSize="10" fill="#6b7280">
        {last.date}
      </text>
    </svg>
  );
}

/* ---------- Helpers: cadence, deltas, CSV ---------- */
function monthsDiff(a: string, b: string) {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}
function inferCadenceMonths(obs: SeriesObs[]): number {
  if (obs.length < 3) return 1;
  const diffs: number[] = [];
  for (let i = obs.length - 1; i > 0 && diffs.length < 4; i--) {
    diffs.push(Math.max(1, Math.abs(monthsDiff(obs[i - 1].date.slice(0, 7), obs[i].date.slice(0, 7)))));
  }
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  // Snap to common cadences
  if (avg >= 2 && avg <= 4) return 3; // quarterly-ish
  if (avg > 10) return 12;            // annual-ish
  return 1;                            // monthly default
}
function computeDeltas(obs: SeriesObs[]) {
  if (!obs || obs.length < 2) return { mom: null as number | null, yoy: null as number | null, momLabel: "MoM" };
  const cadence = inferCadenceMonths(obs);
  const last = obs[obs.length - 1].value;

  // MoM/QoQ depending on cadence
  const momLabel = cadence === 3 ? "QoQ" : "MoM";
  const step = 1; // one period back (month or quarter)
  const prevIdx = obs.length - 1 - step;
  const mom = prevIdx >= 0 ? ((last - obs[prevIdx].value) / obs[prevIdx].value) * 100 : null;

  // YoY: 12 months back (or 4 quarters back if quarterly; or 1 year back if annual)
  const periodsPerYear = Math.max(1, Math.round(12 / cadence));
  const yoyIdx = obs.length - 1 - periodsPerYear;
  const yoy = yoyIdx >= 0 ? ((last - obs[yoyIdx].value) / obs[yoyIdx].value) * 100 : null;

  return { mom, yoy, momLabel };
}
function fmtDelta(pct: number | null) {
  if (pct === null || !isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}
function downloadCSV(filename: string, rows: SeriesObs[]) {
  const header = "date,value";
  const body = rows.map(r => `${r.date},${r.value}`).join("\n");
  const csv = header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Component ---------- */
type Tab = "latest" | "trends";

export default function BLSPage() {
  const thisYear = new Date().getFullYear().toString();

  // Tabs
  const [tab, setTab] = useState<Tab>("latest");

  // ---- Latest Numbers state ----
  const [activeKey, setActiveKey] = useState<IndicatorKey>("CPI");
  const [latestMonths, setLatestMonths] = useState(24);
  const [latestLoading, setLatestLoading] = useState(false);
  const [latestSeries, setLatestSeries] = useState<SeriesOut | null>(null);
  const [latestError, setLatestError] = useState<string | null>(null);

  // ---- Trends state ----
  const [pickedKeys, setPickedKeys] = useState<IndicatorKey[]>(["CPI", "UNRATE"]);
  const [start, setStart] = useState("2018");
  const [end, setEnd] = useState(thisYear);
  const [freq, setFreq] = useState<"monthly" | "annual">("monthly");
  const [trLoading, setTrLoading] = useState(false);
  const [trSeries, setTrSeries] = useState<SeriesOut[]>([]);
  const [trError, setTrError] = useState<string | null>(null);

  // Auto-load an initial latest number
  useEffect(() => {
    if (tab === "latest" && !latestSeries && !latestLoading) {
      void loadLatest(activeKey, latestMonths);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function keyToIds(keys: IndicatorKey[]) {
    return keys.map((k) => INDICATORS[k].id).join(",");
  }

  async function loadLatest(key: IndicatorKey, months: number) {
    setActiveKey(key);
    setLatestLoading(true);
    setLatestError(null);
    setLatestSeries(null);
    try {
      const endYear = new Date().getFullYear();
      const startYear = Math.max(2000, endYear - Math.ceil(months / 12) - 1); // buffer
      const qs = new URLSearchParams({
        ids: INDICATORS[key].id,
        start: String(startYear),
        end: String(endYear),
        freq: "monthly",
      });
      const r = await fetch(`/api/bls/series?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch");
      const s: SeriesOut | undefined = (j.data || [])[0];
      if (!s) throw new Error("No data");
      const obs = s.observations.slice(-months); // last N months
      setLatestSeries({ ...s, observations: obs, latest: obs[obs.length - 1] });
    } catch (e: any) {
      setLatestError(e?.message || "Error");
    } finally {
      setLatestLoading(false);
    }
  }

  function toggleKey(k: IndicatorKey) {
    setPickedKeys((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
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
      setTrSeries(Array.isArray(j.data) ? j.data : []);
    } catch (e: any) {
      setTrError(e?.message || "Error");
    } finally {
      setTrLoading(false);
    }
  }

  /* ---------- Renders ---------- */
  const latestCard = useMemo(() => {
    if (latestError) return <div className="text-red-600 text-sm">Error: {latestError}</div>;
    if (latestLoading || !latestSeries)
      return <div className="text-sm text-gray-600">Loading…</div>;

    const meta = latestSeries;
    const last = meta.latest;
    const { mom, yoy, momLabel } = computeDeltas(meta.observations);

    return (
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">{INDICATORS[activeKey].label}</div>
            <div className="text-xs text-gray-600">
              Units: {meta.units || INDICATORS[activeKey].unitsHint} • {meta.seasonal}
            </div>
            {last && (
              <div className="text-2xl font-semibold mt-2">
                {last.value}{" "}
                <span className="text-sm text-gray-500">({last.date})</span>
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-xs mt-2">
              <span className="rounded-full bg-gray-100 px-2 py-0.5">
                {momLabel}: <strong>{fmtDelta(mom)}</strong>
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5">
                YoY: <strong>{fmtDelta(yoy)}</strong>
              </span>
            </div>
          </div>
          <button
            onClick={() =>
              downloadCSV(
                `${INDICATORS[activeKey].label.replace(/\s+/g, "_")}.csv`,
                meta.observations
              )
            }
            className="text-xs border rounded-md px-2 py-1 hover:bg-gray-50"
            title="Download CSV"
          >
            Download CSV
          </button>
        </div>
        <div className="mt-3 text-gray-800">
          <LineChart data={meta.observations} />
        </div>
      </div>
    );
  }, [latestLoading, latestError, latestSeries, activeKey]);

  const trendCards = useMemo(
    () =>
      trSeries.map((s) => {
        const { mom, yoy, momLabel } = computeDeltas(s.observations);
        const friendly =
          s.title ||
          Object.values(INDICATORS).find((x) => x.id === s.id)?.label ||
          s.id;
        const units =
          s.units ||
          Object.values(INDICATORS).find((x) => x.id === s.id)?.unitsHint ||
          "—";
        return (
          <div key={s.id} className="rounded-2xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{friendly}</div>
                <div className="text-xs text-gray-600">
                  Units: {units} • {s.seasonal}
                </div>
                {s.latest && (
                  <div className="text-xs mt-1">
                    Latest: <span className="font-semibold">{s.latest.value}</span>{" "}
                    on {s.latest.date}
                  </div>
                )}
                <div className="flex flex-wrap gap-3 text-xs mt-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5">
                    {momLabel}: <strong>{fmtDelta(mom)}</strong>
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5">
                    YoY: <strong>{fmtDelta(yoy)}</strong>
                  </span>
                </div>
              </div>
              <button
                onClick={() =>
                  downloadCSV(`${friendly.replace(/\s+/g, "_")}.csv`, s.observations)
                }
                className="text-xs border rounded-md px-2 py-1 hover:bg-gray-50 self-start"
                title="Download CSV"
              >
                Download CSV
              </button>
            </div>
            <div className="mt-3 text-gray-800">
              <LineChart data={s.observations} height={160} />
            </div>
          </div>
        );
      }),
    [trSeries]
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">BLS Economic Data</h1>
      <p className="text-gray-600 text-sm mb-4">
        Check the latest numbers at a glance or explore historical trends by indicator.
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

      {/* LATEST NUMBERS */}
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
                <option value={12}>12 mo</option>
                <option value={24}>24 mo</option>
                <option value={60}>5 yrs</option>
                <option value={120}>10 yrs</option>
              </select>
              <button
                onClick={() => loadLatest(activeKey, latestMonths)}
                className="px-3 py-1 rounded-md bg-black text-white text-sm disabled:opacity-60"
                disabled={latestLoading}
              >
                {latestLoading ? "Loading…" : "Latest Number"}
              </button>
            </div>
          </div>

          <div className="mt-4">{latestCard}</div>
        </section>
      )}

      {/* TRENDS */}
      {tab === "trends" && (
        <section className="grid md:grid-cols-[260px_1fr] gap-4">
          {/* Left: indicator picker */}
          <aside className="rounded-2xl border bg-white p-4 h-fit">
            <div className="font-medium mb-2">Pick indicators</div>
            <div className="space-y-2">
              {(Object.keys(INDICATORS) as IndicatorKey[]).map((k) => {
                const checked = pickedKeys.includes(k);
                return (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleKey(k)}
                    />
                    <span>{INDICATORS[k].label}</span>
                  </label>
                );
              })}
            </div>
            <div className="text-xs text-gray-600 mt-3">
              Tip: Productivity is quarterly; others are monthly.
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
                {trLoading ? "Getting…" : "Get data"}
              </button>
            </div>

            {trError && <div className="text-red-600 text-sm mt-3">Error: {trError}</div>}

            <div className="mt-4 grid gap-4">
              {trendCards}
              {!trLoading && trSeries.length === 0 && (
                <div className="text-sm text-gray-600">
                  Select one or more indicators on the left, set your dates, and click “Get data”.
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
