// app/bea/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

/* ---------- tiny helpers ---------- */
function toNum(x: unknown) {
  if (x == null) return null;
  const n = Number(String(x).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function fmt(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString();
}
function parseTime(t?: string) {
  // Accepts "YYYY", "YYYYQn"
  if (!t) return { y: 0, q: 0, label: "" };
  const m = t.match(/^(\d{4})(Q([1-4]))?$/i);
  if (!m) return { y: 0, q: 0, label: t };
  const y = Number(m[1]);
  const q = m[3] ? Number(m[3]) : 0;
  return { y, q, label: t };
}

/* ---------- minimal SVG chart ---------- */
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
  const asc = [...points].sort((a, b) => {
    const A = parseTime(a.t), B = parseTime(b.t);
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
  const scaleY = (v: number) =>
    y1 === y0 ? height / 2 : height - pad - ((v - y0) / (y1 - y0)) * (height - pad * 2);

  let d = `M ${pad},${scaleY(ys[0])}`;
  for (let i = 1; i < ys.length; i++) d += ` L ${pad + i * dx},${scaleY(ys[i])}`;

  const step = Math.max(1, Math.round(xs.length / xTickTarget));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="BEA trend chart">
      <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill="none" stroke="#d1d5db" />
      {xs.map((_t, i) =>
        i % step === 0 ? <line key={i} x1={pad + i * dx} y1={pad} x2={pad + i * dx} y2={height - pad} stroke="#f0f0f0" /> : null
      )}
      <path d={d} fill="none" stroke="#0f172a" strokeWidth={2} />
      <circle cx={pad} cy={scaleY(ys[0])} r={2.2} fill="#0f172a" />
      <circle cx={width - pad} cy={scaleY(ys[ys.length - 1])} r={2.2} fill="#0f172a" />
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

/* ---------- types ---------- */
type TablesResp = { dataset: string; paramUsed: string | null; options: { key: string; desc: string }[]; warning?: string };
type Row = { time: string; value: number | null; line: string; lineDesc: string; unit?: string | null };

export default function BEAPage() {
  /* Controls */
  const [dataset, setDataset] = useState("NIPA");
  const [freq, setFreq] = useState(""); // not all datasets accept Frequency; keep optional
  const [year, setYear] = useState("LAST10");

  // Selector (param + value) discovered per dataset
  const [paramUsed, setParamUsed] = useState<string | null>("TableName");
  const [options, setOptions] = useState<TablesResp["options"]>([]);
  const [value, setValue] = useState<string>("T10101"); // works for NIPA when param=TableName

  // Data
  const [rows, setRows] = useState<Row[]>([]);
  const [line, setLine] = useState<string>("1");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listWarning, setListWarning] = useState<string | null>(null);

  const lineOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.line && r.lineDesc) m.set(r.line, r.lineDesc);
    return Array.from(m, ([ln, desc]) => ({ ln, desc })).sort((a, b) => Number(a.ln) - Number(b.ln));
  }, [rows]);

  async function loadOptions(ds = dataset) {
    setLoadingList(true);
    setListWarning(null);
    try {
      const r = await fetch(`/api/bea/tables?dataset=${encodeURIComponent(ds)}`, { cache: "no-store" });
      const j: TablesResp = await r.json();
      setParamUsed(j.paramUsed);
      setOptions(j.options || []);
      if (j.warning) setListWarning(j.warning);

      // pick first item if current value isn't in list
      if (j.options?.length) {
        const has = j.options.some((o) => o.key === value);
        if (!has) setValue(j.options[0].key);
      }
    } finally {
      setLoadingList(false);
    }
  }

  async function loadData() {
    setLoadingData(true);
    setError(null);
    setRows([]);
    try {
      if (!paramUsed || !value) {
        throw new Error("No selector available for this dataset. Try switching dataset.");
      }
      const qs = new URLSearchParams({
        dataset,
        param: paramUsed,
        value,
        year,
      });
      if (freq) qs.set("freq", freq);

      const r = await fetch(`/api/bea?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "BEA fetch failed");
      const mapped: Row[] = (j?.rows || []).map((d: any) => ({
        time: d.time,
        value: d.value,
        line: String(d.line ?? ""),
        lineDesc: String(d.lineDesc ?? ""),
        unit: d.unit ?? null,
      }));
      setRows(mapped);

      // Default line
      const lines = new Set(mapped.map((r) => r.line).filter(Boolean));
      if (lines.size) {
        if (!lines.has(line)) setLine([...lines][0]);
      }
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoadingData(false);
    }
  }

  const points = useMemo(() => {
    const filtered = rows.filter((r) => r.line === line && r.value != null) as { time: string; value: number }[];
    const asc = filtered.sort((a, b) => {
      const A = parseTime(a.time), B = parseTime(b.time);
      if (A.y !== B.y) return A.y - B.y;
      return A.q - B.q;
    });
    return asc.map((r) => ({ t: r.time, v: r.value as number }));
  }, [rows, line]);

  // load options when dataset changes
  useEffect(() => {
    void loadOptions(dataset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <section className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">BEA Data Explorer</h1>
          <p className="text-sm text-gray-600">Pick a dataset, choose an item, then view a clean time series + table.</p>
        </header>

        {/* Controls */}
        <div className="rounded-2xl border bg-white p-4">
          <div className="grid md:grid-cols-5 gap-3">
            <label className="flex flex-col">
              <span className="text-sm text-gray-700 mb-1">Dataset</span>
              <select value={dataset} onChange={(e) => setDataset(e.target.value)} className="border rounded-md px-3 py-2">
                <option value="NIPA">NIPA (National Income & Product)</option>
                <option value="NIUnderlyingDetail">NIUnderlyingDetail</option>
                <option value="FixedAssets">FixedAssets</option>
                <option value="GDPByIndustry">GDPByIndustry</option>
                <option value="UnderlyingGDPbyIndustry">UnderlyingGDPbyIndustry</option>
                <option value="InputOutput">InputOutput</option>
                <option value="Regional">Regional</option>
                <option value="ITA">ITA (International Transactions)</option>
                <option value="IntlServTrade">IntlServTrade</option>
                <option value="IntlServSTA">IntlServSTA</option>
                <option value="IIP">IIP (Int’l Investment Position)</option>
                <option value="MNE">MNE (Direct Investment & MNEs)</option>
              </select>
            </label>

            <label className="flex flex-col">
              <span className="text-sm text-gray-700 mb-1">Years</span>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="border rounded-md px-3 py-2">
                <option value="LAST10">Last 10</option>
                <option value="ALL">All</option>
                <option value="2018,2019,2020,2021,2022,2023,2024">2018–2024</option>
              </select>
            </label>

            <label className="flex flex-col">
              <span className="text-sm text-gray-700 mb-1">Frequency (optional)</span>
              <select value={freq} onChange={(e) => setFreq(e.target.value)} className="border rounded-md px-3 py-2">
                <option value="">Auto</option>
                <option value="Q">Quarterly</option>
                <option value="A">Annual</option>
                <option value="M">Monthly</option>
              </select>
              <span className="text-[11px] text-gray-500 mt-1">Some datasets ignore Frequency.</span>
            </label>

            <label className="flex flex-col md:col-span-2">
              <span className="text-sm text-gray-700 mb-1">
                {loadingList ? "Loading options…" : paramUsed ? `${paramUsed} options` : "Selector"}
              </span>
              <select
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="border rounded-md px-3 py-2"
              >
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.key} — {o.desc}
                  </option>
                ))}
              </select>
              {listWarning && <span className="text-[11px] text-amber-700 mt-1">{listWarning}</span>}
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={loadData} className="rounded-full bg-black text-white px-4 py-2 text-sm disabled:opacity-60" disabled={loadingData}>
              {loadingData ? "Loading…" : "Get data"}
            </button>
            <button onClick={() => loadOptions(dataset)} className="rounded-full border px-4 py-2 text-sm">
              Refresh list
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
                    <option key={o.ln} value={o.ln}>{o.ln}. {o.desc}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 text-gray-900">
              {points.length > 1 ? (
                <LineChart points={points.map((p) => ({ t: p.t, v: p.v }))} />
              ) : (
                <div className="text-sm text-gray-600">Pick a dataset & option, then click “Get data”.</div>
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
                    <td className="py-1">{fmt(toNum(r.value))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && <div className="text-xs text-gray-500 mt-2">Showing first 200 rows.</div>}
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
