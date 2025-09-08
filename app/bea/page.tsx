"use client";

import { useEffect, useMemo, useState } from "react";

/** Small helpers */
function num(n: unknown) {
  if (n == null) return null;
  const x = Number(String(n).replace(/,/g, ""));
  return Number.isFinite(x) ? x : null;
}
function fmt(n: number | null) {
  if (n == null) return "—";
  // GDP etc are often in billions; we just format with separators
  return n.toLocaleString();
}
function parseTime(t?: string) {
  // BEA returns "2024Q1" or "2024"
  if (!t) return { label: "", y: 0, q: 0 };
  const m = t.match(/^(\d{4})(Q([1-4]))?$/i);
  if (!m) return { label: t, y: 0, q: 0 };
  const y = Number(m[1]);
  const q = m[3] ? Number(m[3]) : 0;
  return { label: t, y, q };
}

/** Simple, crisp line chart (SVG only) */
function LineChart({
  points,
  height = 200,
  pad = 12,
  xTickTarget = 8,
}: {
  points: { t: string; v: number }[];
  height?: number;
  pad?: number;
  xTickTarget?: number;
}) {
  if (!points?.length) return null;
  // Sort ascending by year/quarter
  const asc = [...points].sort((a, b) => {
    const A = parseTime(a.t); const B = parseTime(b.t);
    if (A.y !== B.y) return A.y - B.y;
    return A.q - B.q;
  });

  const width = 700;
  const xs = asc.map((p) => p.t);
  const ys = asc.map((p) => p.v);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const y0 = minY - (maxY - minY) * 0.08;
  const y1 = maxY + (maxY - minY) * 0.08;

  const dx = (width - pad * 2) / Math.max(1, xs.length - 1);
  const scaleY = (v: number) => y1 === y0 ? height / 2 : height - pad - ((v - y0) / (y1 - y0)) * (height - pad * 2);

  let d = `M ${pad},${scaleY(ys[0])}`;
  for (let i = 1; i < ys.length; i++) d += ` L ${pad + i * dx},${scaleY(ys[i])}`;

  // pick about xTickTarget ticks
  const step = Math.max(1, Math.round(xs.length / xTickTarget));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="BEA trend chart">
      <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill="none" stroke="#d1d5db" />
      {/* light vertical grid */}
      {xs.map((_t, i) =>
        i % step === 0 ? <line key={i} x1={pad + i * dx} y1={pad} x2={pad + i * dx} y2={height - pad} stroke="#f0f0f0" /> : null
      )}
      <path d={d} fill="none" stroke="#0f172a" strokeWidth={2} />
      <circle cx={pad} cy={scaleY(ys[0])} r={2.4} fill="#0f172a" />
      <circle cx={width - pad} cy={scaleY(ys[ys.length - 1])} r={2.4} fill="#0f172a" />
      {/* x labels */}
      {xs.map((t, i) =>
        i % step === 0 || i === xs.length - 1 ? (
          <text key={i} x={pad + i * dx - 12} y={height - 2} fontSize="10" fill="#6b7280">
            {t}
          </text>
        ) : null
      )}
    </svg>
  );
}

type TableMeta = { name: string; desc: string };
type Row = { time: string; value: number | null; line: string; lineDesc: string; unit?: string | null };

export default function BEAPage() {
  // Controls
  const [dataset, setDataset] = useState("NIPA");     // NIPA default
  const [freq, setFreq] = useState<"A" | "Q">("Q");   // annual or quarterly
  const [year, setYear] = useState("LAST10");         // ALL | LAST10 | comma list
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [table, setTable] = useState("T10101");       // GDP (current $) is a sensible default in NIPA
  const [loadingTables, setLoadingTables] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Series selection (LineNumber)
  const lineOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (r.line && r.lineDesc) m.set(r.line, r.lineDesc);
    }
    return Array.from(m, ([line, desc]) => ({ line, desc })).sort((a, b) => Number(a.line) - Number(b.line));
  }, [rows]);
  const [line, setLine] = useState<string>("1"); // default: headline series (often line 1)

  // Fetch table list
  async function loadTables(ds = dataset) {
    setLoadingTables(true);
    try {
      const r = await fetch(`/api/bea/tables?dataset=${encodeURIComponent(ds)}`, { cache: "no-store" });
      const j = await r.json();
      setTables(j?.tables || []);
      // Keep current selection if present; otherwise pick a “GDP-like” table if found.
      const hasCurrent = (j?.tables || []).some((t: TableMeta) => t.name === table);
      if (!hasCurrent) {
        const gdp = (j?.tables || []).find((t: TableMeta) => /gross domestic product/i.test(t.desc)) || j?.tables?.[0];
        if (gdp) setTable(gdp.name);
      }
    } finally {
      setLoadingTables(false);
    }
  }

  // Fetch data
  async function loadData() {
    setLoading(true);
    setError(null);
    setRows([]);
    try {
      const qs = new URLSearchParams({
        dataset,
        table,
        freq,
        year,
      });
      const r = await fetch(`/api/bea?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "BEA fetch failed");
      const raw = (j?.rows || []) as any[];
      const mapped: Row[] = raw.map((d) => ({
        time: d.time,
        value: d.value,
        line: String(d.line ?? ""),
        lineDesc: String(d.lineDesc ?? ""),
        unit: d.unit ?? null,
      }));
      setRows(mapped);
      // If current line not present, reset to first available
      if (mapped.length) {
        const lines = new Set(mapped.map((r) => r.line).filter(Boolean));
        if (!lines.has(line)) {
          const first = [...lines][0];
          if (first) setLine(first);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  // Derived: chart points for selected line
  const points = useMemo(() => {
    const filtered = rows.filter((r) => r.line === line && r.value != null) as { time: string; value: number }[];
    // Sort ascending by year/quarter
    const asc = filtered.sort((a, b) => {
      const A = parseTime(a.time); const B = parseTime(b.time);
      if (A.y !== B.y) return A.y - B.y;
      return A.q - B.q;
    });
    return asc.map((r) => ({ t: r.time, v: r.value as number }));
  }, [rows, line]);

  useEffect(() => {
    loadTables().catch(() => {});
  }, [dataset]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <section className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">BEA National Accounts</h1>
          <p className="text-sm text-gray-600">
            Explore BEA tables (e.g., GDP, PCE) with a clean chart and downloadable values.
          </p>
        </header>

        {/* Controls card */}
        <div className="rounded-2xl border bg-white p-4">
          <div className="grid md:grid-cols-5 gap-3">
            <label className="flex flex-col">
              <span className="text-sm text-gray-700 mb-1">Dataset</span>
              <select
                value={dataset}
                onChange={(e) => setDataset(e.target.value)}
                className="border rounded-md px-3 py-2"
              >
                <option value="NIPA">NIPA (National Income & Product)</option>
                <option value="NIUnderlyingDetail">NIUnderlyingDetail</option>
                <option value="Regional">Regional</option>
                {/* Add others as needed */}
              </select>
            </label>

            <label className="flex flex-col">
              <span className="text-sm text-gray-700 mb-1">Frequency</span>
              <select value={freq} onChange={(e) => setFreq(e.target.value as "A" | "Q")} className="border rounded-md px-3 py-2">
                <option value="Q">Quarterly</option>
                <option value="A">Annual</option>
              </select>
            </label>

            <label className="flex flex-col">
              <span className="text-sm text-gray-700 mb-1">Years</span>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="border rounded-md px-3 py-2">
                <option value="LAST10">Last 10</option>
                <option value="ALL">All</option>
                <option value="2018,2019,2020,2021,2022,2023,2024">2018–2024</option>
              </select>
              <span className="text-[11px] text-gray-500 mt-1">Tip: use “ALL” for long history</span>
            </label>

            <label className="flex flex-col md:col-span-2">
              <span className="text-sm text-gray-700 mb-1">
                Table {loadingTables ? "(loading…)" : ""}
              </span>
              <select
                value={table}
                onChange={(e) => setTable(e.target.value)}
                className="border rounded-md px-3 py-2"
              >
                {tables.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} — {t.desc}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={loadData} className="rounded-full bg-black text-white px-4 py-2 text-sm disabled:opacity-60" disabled={loading}>
              {loading ? "Loading…" : "Get data"}
            </button>
            <button onClick={() => loadTables(dataset)} className="rounded-full border px-4 py-2 text-sm">
              Refresh tables
            </button>
          </div>
        </div>

        {/* Results */}
        <section className="mt-4 grid lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Series</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-700">Line</span>
                <select value={line} onChange={(e) => setLine(e.target.value)} className="border rounded-md px-2 py-1 text-sm">
                  {lineOptions.map((o) => (
                    <option key={o.line} value={o.line}>
                      {o.line}. {o.desc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 text-gray-900">
              {points.length > 1 ? (
                <LineChart points={points.map((p) => ({ t: p.t, v: p.v }))} />
              ) : (
                <div className="text-sm text-gray-600">Choose a table and click “Get data”. Then pick a line.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 overflow-x-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Values</h2>
              <span className="text-xs text-gray-600">{rows.length.toLocaleString()} rows</span>
            </div>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-gray-600">
                <tr>
                  <th className="py-1 pr-4">Time</th>
                  <th className="py-1 pr-4">Line</th>
                  <th className="py-1 pr-4">Description</th>
                  <th className="py-1">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 pr-4">{r.time}</td>
                    <td className="py-1 pr-4">{r.line}</td>
                    <td className="py-1 pr-4">{r.lineDesc}</td>
                    <td className="py-1">{fmt(num(r.value))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && (
              <div className="text-xs text-gray-500 mt-2">Showing first 200 rows.</div>
            )}
          </div>
        </section>

        {error && <div className="mt-4 text-sm text-red-600">Error: {error}</div>}

        <footer className="mt-8 text-center text-xs text-gray-500">
          Source: U.S. Bureau of Economic Analysis (BEA). This site repackages public data for convenience.
        </footer>
      </section>
    </main>
  );
}

