// app/bls/page.tsx
"use client";

import { useMemo, useState } from "react";

/** Types from your existing API */
type SeriesObs = { date: string; value: number };
type SeriesOut = {
  id: string;
  title: string;
  units: string;
  seasonal: "SA" | "NSA";
  observations: SeriesObs[];
  latest?: SeriesObs | null;
};

type ReleaseRow = {
  code: string;
  series: string;
  name: string;
  typical_time_et: string;
  next_release: string | null;
  latest?: { date: string; value: number } | null;
};

const PRESETS = [
  { label: "CPI-U Headline (SA)", id: "CUUR0000SA0", tip: "Index 1982-84=100" },
  { label: "Unemployment Rate (SA)", id: "LNS14000000", tip: "Percent" },
  { label: "Nonfarm Payrolls (SA)", id: "CES0000000001", tip: "Thousands" },
  { label: "Labor Productivity (Nonfarm)", id: "PRS85006092", tip: "Index 2017=100" },
  { label: "Avg Hourly Earnings (Total Private)", id: "CES0500000003", tip: "USD" },
];

export default function BLSPage() {
  // query inputs
  const [ids, setIds] = useState("CUUR0000SA0,LNS14000000");
  const [start, setStart] = useState("2010");
  const [end, setEnd] = useState(new Date().getFullYear().toString());
  const [freq, setFreq] = useState<"monthly" | "annual">("monthly");

  // state
  const [loading, setLoading] = useState(false);
  const [series, setSeries] = useState<SeriesOut[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [releases, setReleases] = useState<ReleaseRow[] | null>(null);
  const [relLoading, setRelLoading] = useState(false);

  async function fetchSeries() {
    setLoading(true); setError(null); setSeries([]);
    try {
      const qs = new URLSearchParams({ ids, start, end, freq });
      const r = await fetch(`/api/bls/series?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch series");
      setSeries(Array.isArray(j.data) ? j.data : []);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  async function fetchReleases() {
    setRelLoading(true);
    try {
      const r = await fetch(`/api/bls/releases?withLatest=1`, { cache: "no-store" });
      const j = await r.json();
      setReleases(j.data || []);
    } finally {
      setRelLoading(false);
    }
  }

  // sparkline with brand color + better axis ticks
  function Spark({ data }: { data: SeriesObs[] }) {
    if (!data || data.length < 2) return null;
    const width = 260, height = 80, pad = 6, left = 24, bottom = 16;
    const xs = data.map((_, i) => i);
    const ys = data.map(d => Number(d.value));
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const dx = (width - pad - left) / (xs.length - 1 || 1);
    const scaleY = (v: number) => {
      if (maxY === minY) return height/2;
      return height - bottom - ((v - minY) / (maxY - minY)) * (height - bottom - pad);
    };
    // path
    const path = xs.map((x, i) => `${i ? "L" : "M"} ${left + i*dx},${scaleY(ys[i])}`).join(" ");
    // axis ticks (start, mid, end)
    const tickIdx = [0, Math.floor(xs.length/2), xs.length-1].filter(i => i >= 0);
    return (
      <svg width={width} height={height} aria-hidden>
        {/* X ticks (dates) */}
        {tickIdx.map((i, k)=>(
          <g key={k}>
            <text x={left + i*dx} y={height-2} fontSize="10" textAnchor="middle" fill="#6b7280">
              {data[i]?.date?.slice(0,7) ?? ""}
            </text>
          </g>
        ))}
        {/* Y min/max */}
        <text x={2} y={scaleY(minY)} fontSize="10" fill="#6b7280">{minY.toFixed(0)}</text>
        <text x={2} y={scaleY(maxY)} fontSize="10" fill="#6b7280">{maxY.toFixed(0)}</text>
        {/* Line */}
        <path d={path} fill="none" stroke="#7E36D1" strokeWidth={2} />
      </svg>
    );
  }

  const hasSeries = series.length > 0;
  const seriesCards = useMemo(() => {
    return series.map((s) => (
      <div key={s.id} className="border rounded-xl p-4 bg-white shadow-sm hover:shadow transition">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-brand">{s.title}</div>
            <div className="text-xs text-gray-600">
              ID: <code>{s.id}</code> • Units: {s.units || "—"} • {s.seasonal}
            </div>
          </div>
          <div className="text-gray-800"><Spark data={s.observations.slice(-60)} /></div>
        </div>
        {s.latest && (
          <div className="text-xs mt-2">
            Latest: <span className="font-semibold">{s.latest.value}</span> on {s.latest.date}
          </div>
        )}
        <div className="text-xs text-gray-600 mt-1">
          Observations: {s.observations?.length ?? 0}
        </div>
      </div>
    ));
  }, [series]);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="bg-gradient-to-r from-brand via-brand-blue to-brand-pink text-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-3xl font-bold tracking-tight">BLS Data</h1>
          <p className="text-white/90 mt-1">
            Query historical time series and see upcoming releases with latest prints.
          </p>

          {/* Controls */}
          <div className="mt-5 grid md:grid-cols-4 gap-3">
            <label className="md:col-span-2">
              <div className="text-sm text-white/90">Series IDs (comma-separated)</div>
              <input
                value={ids}
                onChange={(e)=>setIds(e.target.value)}
                className="w-full rounded-md px-3 py-2 text-gray-900"
                placeholder="CUUR0000SA0,LNS14000000"
              />
            </label>
            <label>
              <div className="text-sm text-white/90">Start</div>
              <input value={start} onChange={(e)=>setStart(e.target.value)} className="w-full rounded-md px-3 py-2 text-gray-900" />
            </label>
            <label>
              <div className="text-sm text-white/90">End</div>
              <input value={end} onChange={(e)=>setEnd(e.target.value)} className="w-full rounded-md px-3 py-2 text-gray-900" />
            </label>
            <label>
              <div className="text-sm text-white/90">Frequency</div>
              <select value={freq} onChange={(e)=>setFreq(e.target.value as any)} className="w-full rounded-md px-3 py-2 text-gray-900">
                <option value="monthly">Monthly</option>
                <option value="annual">Annual Avg</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                onClick={fetchSeries}
                className="w-full rounded-md bg-white/10 hover:bg-white/20 text-white px-4 py-2"
                disabled={loading}
              >
                {loading ? "Getting…" : "Get series"}
              </button>
            </div>
            {/* Presets */}
            <div className="md:col-span-3 flex flex-wrap items-center gap-2">
              {PRESETS.map(p=>(
                <button
                  key={p.id}
                  className="text-xs rounded-full bg-white/10 hover:bg-white/20 px-3 py-1"
                  title={p.tip}
                  onClick={()=>{
                    const cur = ids.split(",").map(s=>s.trim()).filter(Boolean);
                    if (!cur.includes(p.id)) setIds([...cur, p.id].join(","));
                  }}
                >
                  + {p.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="mt-3 text-sm bg-white/10 rounded px-3 py-2">{error}</div>}
        </div>
      </div>

      {/* Releases */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-2xl border bg-white p-4 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Upcoming Releases & Latest Prints</h2>
            <button
              onClick={fetchReleases}
              className="px-3 py-1 rounded-md bg-brand text-white hover:bg-brand-pink text-sm disabled:opacity-60"
              disabled={relLoading}
            >
              {relLoading ? "Loading…" : "Refresh"}
            </button>
          </div>

          <div className="mt-3 grid md:grid-cols-2 gap-3">
            {(releases || []).map((r, i) => (
              <div key={i} className="border rounded-xl p-3 bg-white">
                <div className="text-sm font-medium text-brand">{r.name}</div>
                <div className="text-xs text-gray-600 mt-1">Series: <code>{r.series}</code></div>
                <div className="text-xs mt-1">Typical time: <strong>{r.typical_time_et} ET</strong></div>
                <div className="text-xs mt-1">Next release: <strong>{r.next_release ?? "TBA"}</strong></div>
                {r.latest && (
                  <div className="text-xs mt-1 text-gray-700">Latest: {r.latest.date} → <strong>{r.latest.value}</strong></div>
                )}
              </div>
            ))}
            {!releases && <div className="text-sm text-gray-600">Click “Refresh” to load releases.</div>}
          </div>
        </div>

        {/* Series results */}
        <section className="rounded-2xl border bg-white p-4">
          <h2 className="font-semibold mb-3">Series</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {seriesCards}
            {!loading && !hasSeries && (
              <div className="text-sm text-gray-600">
                Enter one or more series IDs and click “Get series”.
              </div>
            )}
          </div>

          <div className="mt-10 text-xs text-gray-500">
            This site republishes SEC EDGAR filings and BLS data. © Herevna.io
          </div>
        </section>
      </div>
    </div>
  );
}
