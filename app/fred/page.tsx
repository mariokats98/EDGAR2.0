// app/fred/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Common interest-rate & market presets */
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
  seasonal: string; // SA/NSA
  frequency: string;
  observations: Obs[];
  latest?: Obs | null;
};

export default function FREDPage() {
  // Query state
  const [ids, setIds] = useState("DFF,DGS2,DGS10");
  const [start, setStart] = useState("2000-01-01");
  const [end, setEnd] = useState(new Date().toISOString().slice(0,10));
  const [freq, setFreq] = useState<"d"|"w"|"m"|"q"|"a">("m");

  // Search state (autocomplete)
  const [query, setQuery] = useState("");
  const [sugs, setSugs] = useState<any[]>([]);
  const [sOpen, setSOpen] = useState(false);
  const tRef = useRef<any>(null);

  // Data
  const [loading, setLoading] = useState(false);
  const [series, setSeries] = useState<SeriesOut[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load series
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
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
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
    return () => { if (tRef.current) clearTimeout(tRef.current); };
  }, [query]);

  // Simple on-brand line chart with readable axes
  function LineChart({ data, width=680, height=240 }: { data: Obs[]; width?: number; height?: number; }) {
    if (!data || data.length < 2) return null;
    const pad = 10, left = 36, bottom = 22, right = 10, top = 10;
    const xs = data.map((_, i) => i);
    const ys = data.map(d => d.value);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const dx = (width - left - right) / (xs.length - 1 || 1);
    const scaleY = (v: number) => {
      if (maxY === minY) return height/2;
      return height - bottom - ((v - minY) / (maxY - minY)) * (height - bottom - top);
    };
    const path = xs.map((x, i) => `${i ? "L" : "M"} ${left + i*dx},${scaleY(ys[i])}`).join(" ");

    // X ticks: first/middle/last
    const idx = [0, Math.floor(xs.length/2), xs.length-1].filter(i => i >= 0);
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        {/* axes labels */}
        {idx.map((i,k)=>(
          <text key={k} x={left + i*dx} y={height-4} fontSize="11" textAnchor="middle" fill="#6b7280">
            {(data[i]?.date || "").slice(0,7)}
          </text>
        ))}
        <text x={4} y={scaleY(minY)} fontSize="11" fill="#6b7280">{minY.toFixed(2)}</text>
        <text x={4} y={scaleY(maxY)} fontSize="11" fill="#6b7280">{maxY.toFixed(2)}</text>
        {/* line */}
        <path d={path} stroke="#7E36D1" strokeWidth={2} fill="none" />
      </svg>
    );
  }

  const cards = useMemo(() => {
    return series.map((s) => (
      <div key={s.id} className="rounded-2xl border bg-white p-4 shadow-sm hover:shadow transition">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-brand">{s.title}</div>
            <div className="text-xs text-gray-600">
              ID: <code>{s.id}</code> • Units: {s.units || "—"} • {s.seasonal} • Freq: {s.frequency}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <LineChart data={s.observations} />
        </div>
        {s.latest && (
          <div className="text-xs mt-2">
            Latest: <span className="font-semibold">{s.latest.value}</span> on {s.latest.date}
          </div>
        )}
      </div>
    ));
  }, [series]);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="bg-gradient-to-r from-brand via-brand-blue to-brand-pink text-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-3xl font-bold tracking-tight">FRED Interest Rates & Indicators</h1>
          <p className="text-white/90 mt-1">
            Search any FRED series (autocomplete), use presets for popular rates, and visualize trends with clean charts.
          </p>

          {/* Controls */}
          <div className="mt-5 grid md:grid-cols-4 gap-3">
            {/* Autocomplete add */}
            <div className="relative md:col-span-2">
              <label className="text-sm text-white/90">Add series by name</label>
              <input
                value={query}
                onChange={(e)=>setQuery(e.target.value)}
                onFocus={()=>sugs.length && setSOpen(true)}
                placeholder="e.g., '10-Year Treasury' or 'mortgage rate'"
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
                      <div className="font-medium">{s.title}</div>
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

