// app/bls/page.tsx
"use client";

import { useMemo, useState } from "react";

// Quick presets for common BLS series
const PRESETS = [
  { label: "CPI-U Headline (SA)", id: "CUUR0000SA0", tip: "Index 1982-84=100" },
  { label: "Unemployment Rate (SA)", id: "LNS14000000", tip: "Percent" },
  { label: "Nonfarm Payrolls (SA)", id: "CES0000000001", tip: "Thousands" },
];

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

export default function BLSPage() {
  // Query inputs
  const [ids, setIds] = useState("CUUR0000SA0,LNS14000000");
  const [start, setStart] = useState("2018");
  const [end, setEnd] = useState(new Date().getFullYear().toString());
  const [freq, setFreq] = useState<"monthly" | "annual">("monthly");

  // State
  const [loading, setLoading] = useState(false);
  const [series, setSeries] = useState<SeriesOut[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [releases, setReleases] = useState<ReleaseRow[] | null>(null);
  const [relLoading, setRelLoading] = useState(false);

  // Fetch historical series
  async function fetchSeries() {
    setLoading(true); setError(null); setSeries([]);
    try {
      const qs = new URLSearchParams({ ids, start, end, freq });
      const r = await fetch(`/api/bls/series?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch series");
      setSeries(Array.isArray(j.data) ? j.data : []);
    } catch (e: any) {
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  // Fetch releases (with latest values)
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

  // Small helper for a tiny inline sparkline (no external libs)
  function Spark({ data }: { data: SeriesObs[] }) {
    if (!data || data.length < 2) return null;
    const width = 160, height = 40, pad = 2;
    const xs = data.map((_, i) => i);
    const ys = data.map(d => Number(d.value));
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const dx = (width - pad * 2) / (xs.length - 1 || 1);
    const scaleY = (v: number) => {
      if (maxY === minY) return height / 2;
      return height - pad - ((v - minY) / (maxY - minY)) * (height - pad * 2);
    };
    const path = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${pad + i * dx},${scaleY(ys[i])}`).join(" ");
    return (
      <svg width={width} height={height} aria-hidden>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
      </svg>
    );
  }

  const hasSeries = series.length > 0;

  const seriesCards = useMemo(() => {
    return series.map((s) => (
      <div key={s.id} className="border rounded-lg p-3 bg-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">{s.title}</div>
            <div className="text-xs text-gray-600">
              ID: <code>{s.id}</code> • Units: {s.units || "—"} • {s.seasonal}
            </div>
          </div>
          {/* sparkline */}
          <div className="text-gray-800"><Spark data={s.observations.slice(-24)} /></div>
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
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">BLS Data</h1>
      <p className="text-gray-600 text-sm mb-6">
        Query historical BLS series and see upcoming releases with latest prints.
      </p>

      {/* Releases */}
      <section className="rounded-2xl border bg-white p-4 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Upcoming Releases & Latest Prints</h2>
          <button
            onClick={fetchReleases}
            className="px-3 py-1 rounded-md bg-black text-white text-sm disabled:opacity-60"
            disabled={relLoading}
          >
            {relLoading ? "Loading…" : "Refresh"}
          </button>
        </div>

        <div className="mt-3 grid md:grid-cols-2 gap-3">
          {(releases || []).map((r, i) => (
            <div key={i} className="border rounded-lg p-3">
              <div className="text-sm font-medium">{r.name}</div>
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
      </section>

      {/* Series query */}
      <section className="rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1">
            <div className="text-sm text-gray-700">Series IDs (comma-separated)</div>
            <input
              value={ids}
              onChange={(e) => setIds(e.target.value)}
              className="border rounded-md w-full px-3 py-2"
              placeholder="CUUR0000SA0,LNS14000000"
            />
          </label>
          <label>
            <div className="text-sm text-gray-700">Start</div>
            <input
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="border rounded-md px-3 py-2 w-28"
            />
          </label>
          <label>
            <div className="text-sm text-gray-700">End</div>
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
            onClick={fetchSeries}
            className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Getting…" : "Get series"}
          </button>
        </div>

        {/* Quick presets */}
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className="text-xs rounded-full bg-gray-100 px-3 py-1"
              title={p.tip}
              onClick={() => {
                const current = ids.split(",").map(s => s.trim()).filter(Boolean);
                if (!current.includes(p.id)) {
                  setIds([...current, p.id].join(","));
                }
              }}
            >
              + {p.label}
            </button>
          ))}
        </div>

        {/* Errors */}
        {error && <div className="text-red-600 text-sm mt-3">Error: {error}</div>}

        {/* Results */}
        <div className="mt-4 grid md:grid-cols-2 gap-3">
          {seriesCards}
          {!loading && !hasSeries && (
            <div className="text-sm text-gray-600">
              Enter one or more series IDs and click “Get series”.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
