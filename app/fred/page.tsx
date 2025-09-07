// app/fred/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Professional presets (interest rates & benchmark series) */
const PRESETS = [
  { label: "Fed Funds (Effective)", id: "DFF", tip: "Daily effective federal funds rate" },
  { label: "Fed Funds Target Upper", id: "DFEDTARU", tip: "Upper bound of target range" },
  { label: "Fed Funds Target Lower", id: "DFEDTARL", tip: "Lower bound of target range" },
  { label: "UST 3-Month", id: "DGS3MO", tip: "3-Month Treasury Yield (daily)" },
  { label: "UST 2-Year", id: "DGS2", tip: "2-Year Treasury Yield (daily)" },
  { label: "UST 10-Year", id: "DGS10", tip: "10-Year Treasury Yield (daily)" },
  { label: "30-Year Mortgage", id: "MORTGAGE30US", tip: "Freddie Mac Primary Mortgage Market Survey" },
  { label: "Aaa Corporate", id: "AAA", tip: "Moody's Aaa Corporate Bond Yield" },
  { label: "Baa Corporate", id: "BAA", tip: "Moody's Baa Corporate Bond Yield" },
];

type Obs = { date: string; value: number };
type SeriesOut = {
  id: string;
  title: string;
  units: string;
  seasonal: string;   // SA/NSA
  frequency: string;  // D/W/M/Q/A abbreviations text from FRED
  observations: Obs[];
  latest?: Obs | null;
};

export default function FREDPage() {
  // Query state
  const [ids, setIds] = useState("DFF,DGS2,DGS10");
  const [start, setStart] = useState("2000-01-01");
  const [end, setEnd] = useState(new Date().toISOString().slice(0,10));
  const [freq, setFreq] = useState<"d"|"w"|"m"|"q"|"a">("m");

  // Search state
  const [query, setQuery] = useState("");
  const [sugs, setSugs] = useState<any[]>([]);
  const [sOpen, setSOpen] = useState(false);
  const sugTimer = useRef<any>(null);

  // Data state
  const [loading, setLoading] = useState(false);
  const [series, setSeries] = useState<SeriesOut[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function fetchSeries() {
    setLoading(true); setError(null); setSeries([]);
    try {
      const qs = new URLSearchParams({ ids, start, end, freq });
      const r = await fetch(`/api/fred/series?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch");
      setSeries(Array.isArray(j.data) ? j.data : []);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSeries(); }, []); // initial

  // Autocomplete (debounced)
  useEffect(() => {
    if (!query.trim()) { setSugs([]); setSOpen(false); return; }
    if (sugTimer.current) clearTimeout(sugTimer.current);
    sugTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/fred/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const j = await r.json();
        const arr = Array.isArray(j?.results) ? j.results : [];
        setSugs(arr);
        setSOpen(true);
      } catch {
        setSugs([]); setSOpen(false);
      }
    }, 220);
    return () => { if (sugTimer.current) clearTimeout(sugTimer.current); };
  }, [query]);

  /** Professional, readable line chart (responsive, oldest→newest) */
  function LineChart({ data, height = 240, color = "#3b82f6" }: { data: Obs[]; height?: number; color?: string }) {
    if (!data || data.length < 2) return null;

    // Layout
    const width = 720;
    const left = 46, right = 12, top = 12, bottom = 28;

    // Prepare arrays
    const xs = data.map((_, i) => i);
    const ys = data.map(d => d.value);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeY = maxY - minY || 1;

    const dx = (width - left - right) / (xs.length - 1);

    const yScale = (v: number) =>
      top + (1 - (v - minY) / rangeY) * (height - top - bottom);

    const path = xs.map((_, i) => {
      const x = left + i * dx;
      const y = yScale(ys[i]);
      return `${i === 0 ? "M" : "L"} ${x},${y}`;
    }).join(" ");

    // X ticks: choose 4 evenly spaced ticks with YYYY or YYYY-MM
    const tCount = Math.min(6, Math.max(3, Math.floor((width - left - right) / 160)));
    const xIdx: number[] = [];
    for (let k = 0; k < tCount; k++) {
      const i = Math.round(k * (xs.length - 1) / (tCount - 1));
      if (!xIdx.includes(i)) xIdx.push(i);
    }
    const xTickLabel = (s: string) => s.length >= 7 ? s.slice(0, 7) : s.slice(0, 4);

    // Y ticks: min, mid, max
    const yTicks = [minY, minY + rangeY / 2, maxY];

    // Gridlines (light)
    const gridLines = yTicks.map((v, i) => {
      const y = yScale(v);
      return <line key={i} x1={left} y1={y} x2={width - right} y2={y} stroke="#e5e7eb" strokeWidth="1" />;
    });

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        {/* Grid */}
        {gridLines}
        {/* Y-axis labels */}
        {yTicks.map((v, i) => (
          <text key={i} x={left - 8} y={yScale(v)} fontSize="11" textAnchor="end" dominantBaseline="middle" fill="#6b7280">
            {v.toFixed(2)}
          </text>
        ))}
        {/* X-axis labels */}
        {xIdx.map((i, k) => (
          <text key={k} x={left + i * dx} y={height - 8} fontSize="11" textAnchor="middle" fill="#6b7280">
            {xTickLabel(data[i]?.date || "")}
          </text>
        ))}
        {/* Line */}
        <path d={path} stroke={color} strokeWidth={2} fill="none" />
      </svg>
    );
  }

  const cards = useMemo(() => {
    return series.map((s) => (
      <div key={s.id} className="rounded-xl border bg-white p-4 shadow-sm hover:shadow transition">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">{s.title}</div>
            <div className="text-xs text-gray-600">
              ID: <code className="text-gray-800">{s.id}</code> • Units: {s.units || "—"} • {s.seasonal} • Freq: {s.frequency}
            </div>
          </div>
          {s.latest && (
            <div className="text-xs text-gray-700">
              Latest: <span className="font-semibold">{s.latest.value}</span>
              <span className="text-gray-500"> on {s.latest.date}</span>
            </div>
          )}
        </div>
        <div className="mt-3">
          <LineChart data={s.observations} />
        </div>
      </div>
    ));
  }, [series]);

  return (
    <div className="min-h-screen">
      {/* Subtle brand hero */}
      <div className="bg-gradient-to-r from-brand via-brand-blue to-brand-pink text-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-3xl font-semibold tracking-tight">FRED Interest Rates & Indicators</h1>
          <p className="text-white/85 mt-1">
            Professional dashboards for FRED series. Use presets for rates, search by name, and visualize trends.
          </p>

          {/* Controls */}
          <div className="mt-6 grid md:grid-cols-4 gap-3">
            {/* Autocomplete add */}
            <div className="relative md:col-span-2">
              <label className="text-sm text-white/90">Add series by name</label>
              <input
                value={query}
                onChange={(e)=>setQuery(e.target.value)}
                onFocus={()=>sugs.length && setSOpen(true)}
                placeholder="e.g., 10-Year Treasury, Fed Funds, Mortgage Rate"
                className="w-full rounded-md px-3 py-2 text-gray-900"
              />
              {sOpen && sugs.length > 0 && (
                <div
                  className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow"
                  onMouseLeave={()=>setSOpen(false)}
                >
                  {sugs.map((s:any, i:number)=>(
                    <button
                      key={i}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                      onClick={()=>{
                        const cur = ids.split(",").map(x=>x.trim()).filter(Boolean);
                        if (!cur.includes(s.id)) setIds([...cur, s.id].join(","));
                        setQuery(""); setSOpen(false);
                      }}
                      title={`${s.id} • ${s.units}`}
                    >
                      <div className="font-medium text-gray-900">{s.title}</div>
                      <div className="text-gray-600 text-xs">{s.id} • {s.frequency} • {s.seasonal} • {s.units}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* IDs box */}
            <label className="md:col-span-2">
              <div className="text-sm text-white/90">Series IDs (comma-separated)</div>
              <input
                value={ids}
                onChange={(e)=>setIds(e.target.value)}
                className="w-full rounded-md px-3 py-2 text-gray-900"
                placeholder="DFF,DGS10,MORTGAGE30US"
              />
            </label>

            {/* Dates & freq */}
            <label>
              <div className="text-sm text-white/90">Start</div>
              <input type="date" value={start} onChange={(e)=>setStart(e.target.value)} className="w-full rounded-md px-3 py-2 text-gray-900" />
            </label>
            <label>
              <div className="text-sm text-white/90">End</div>
              <input type="date" value={end} onChange={(e)=>setEnd(e.target.value)} className="w-full rounded-md px-3 py-2 text-gray-900" />
            </label>
            <label>
              <div className="text-sm text-white/90">Frequency</div>
              <select value={freq} onChange={(e)=>setFreq(e.target.value as any)} className="w-full rounded-md px-3 py-2 text-gray-900">
                <option value="d">Daily</option>
                <option value="w">Weekly</option>
                <option value="m">Monthly</option>
                <option value="q">Quarterly</option>
                <option value="a">Annual</option>
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
            <div className="md:col-span-4 flex flex-wrap items-center gap-2">
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

      {/* Results */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid md:grid-cols-2 gap-4">
          {cards}
        </div>

        {!loading && series.length === 0 && (
          <div className="text-gray-600 text-sm mt-4">
            Add one or more series and click “Get series”.
          </div>
        )}

        <div className="mt-10 text-xs text-gray-500">
          This site republishes SEC EDGAR filings and BLS data. © Herevna.io
        </div>
      </div>
    </div>
  );
}
