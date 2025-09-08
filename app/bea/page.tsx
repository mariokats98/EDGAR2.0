// app/bea/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

/* -------------------------------
   Small types
------------------------------- */
type Option = { key: string; desc: string };
type Row = {
  time: string;
  value: number | null;
  line: string;
  lineDesc: string;
  unit: string | null;
};
type DatasetKey =
  | "NIPA"
  | "NIUnderlyingDetail"
  | "FixedAssets"
  | "GDPByIndustry"
  | "UnderlyingGDPbyIndustry"
  | "InputOutput"
  | "Regional"
  | "ITA"
  | "IntlServTrade"
  | "IntlServSTA"
  | "IIP"
  | "MNE";

/* -------------------------------
   Nice dataset presets for the UI
------------------------------- */
const DATASETS: { key: DatasetKey; label: string; hint?: string }[] = [
  { key: "NIPA", label: "NIPA (National Income & Product)", hint: "GDP, PCE, income tables" },
  { key: "GDPByIndustry", label: "GDP by Industry" },
  { key: "FixedAssets", label: "Fixed Assets" },
  { key: "Regional", label: "Regional (State/MSA GDP, Income)" },
  { key: "ITA", label: "International Transactions (ITA)" },
  { key: "IIP", label: "International Investment Position (IIP)" },
  { key: "NIUnderlyingDetail", label: "NI Underlying Detail" },
  { key: "UnderlyingGDPbyIndustry", label: "Underlying GDP by Industry" },
  { key: "InputOutput", label: "Input–Output" },
  { key: "IntlServTrade", label: "International Services Trade" },
  { key: "IntlServSTA", label: "Intl Services via Affiliates (STA)" },
  { key: "MNE", label: "Multinational Enterprises (MNE)" },
];

/* -------------------------------
   Helpers for simple line chart
------------------------------- */
function parsePeriod(p: string): Date {
  // Accepts YYYY, YYYY-Qn, YYYY-MM
  let m = p.match(/^(\d{4})-Q([1-4])$/i);
  if (m) return new Date(Number(m[1]), (Number(m[2]) - 1) * 3, 1);
  m = p.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);
  m = p.match(/^(\d{4})$/);
  if (m) return new Date(Number(m[1]), 0, 1);
  const d = new Date(p);
  return isNaN(+d) ? new Date(1970, 0, 1) : d;
}

function sortAsc<T extends { time: string }>(rows: T[]) {
  return [...rows].sort((a, b) => +parsePeriod(a.time) - +parsePeriod(b.time));
}

function inferCadence(rows: Row[]): "A" | "Q" | "M" {
  // heuristic based on time strings
  const hasQ = rows.some((r) => /-Q[1-4]$/i.test(r.time));
  if (hasQ) return "Q";
  const hasM = rows.some((r) => /-\d{2}$/.test(r.time));
  if (hasM) return "M";
  return "A";
}

function xLabel(d: Date, cadence: "A" | "Q" | "M") {
  if (cadence === "A") return d.getFullYear().toString();
  if (cadence === "Q") {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `${d.getFullYear()}-Q${q}`;
  }
  return d.toLocaleString(undefined, { year: "2-digit", month: "short" }); // e.g., "Jan 24"
}

/* Minimal, responsive SVG line chart */
function LineChart({ series, height = 180 }: { series: { x: Date; y: number }[]; height?: number }) {
  if (!series || series.length < 2) return null;
  const width = 640; // used for viewBox; scales to parent width
  const pad = 16;

  const ys = series.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const yPad = Math.max(0.02 * (maxY - minY), 0.0001);
  const y0 = minY - yPad;
  const y1 = maxY + yPad;

  const dx = (width - pad * 2) / (series.length - 1);
  const scaleY = (v: number) => {
    if (y1 === y0) return height / 2;
    return height - pad - ((v - y0) / (y1 - y0)) * (height - pad * 2);
  };

  // Path
  let d = `M ${pad},${scaleY(series[0].y)}`;
  for (let i = 1; i < series.length; i++) {
    d += ` L ${pad + i * dx},${scaleY(series[i].y)}`;
  }

  return (
    <svg className="w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="trend">
      {/* grid */}
      {Array.from({ length: 4 }).map((_, i) => {
        const y = pad + ((height - pad * 2) / 3) * i;
        return <line key={i} x1={pad} y1={y} x2={width - pad} y2={y} stroke="#e5e7eb" />;
      })}
      {/* axis box */}
      <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill="none" stroke="#d1d5db" />
      {/* line */}
      <path d={d} fill="none" stroke="#0f172a" strokeWidth="2" />
      {/* end dots */}
      <circle cx={pad} cy={scaleY(series[0].y)} r="2.5" fill="#0f172a" />
      <circle cx={width - pad} cy={scaleY(series[series.length - 1].y)} r="2.5" fill="#0f172a" />
    </svg>
  );
}

/* -------------------------------
   Page
------------------------------- */
export default function BEAPage() {
  // selectors
  const [dataset, setDataset] = useState<DatasetKey>("NIPA");
  const [paramUsed, setParamUsed] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [value, setValue] = useState<string>("");

  // controls
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState<string>("LAST10"); // BEA supports LAST10, e.g.
  const [freq, setFreq] = useState<string>(""); // some datasets use Annual/Quarterly/Monthly, many ignore

  // data state
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [listWarning, setListWarning] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  // load selector options when dataset changes
  useEffect(() => {
    void loadOptions(dataset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);

  async function loadOptions(ds: DatasetKey) {
    setLoadingList(true);
    setListWarning(null);
    setListError(null);
    setOptions([]);
    setParamUsed(null);
    setValue("");
    try {
      const r = await fetch(`/api/bea/tables?dataset=${encodeURIComponent(ds)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to load options");
      setParamUsed(j.paramUsed ?? null);
      setOptions(Array.isArray(j.options) ? j.options : []);
      if (j.warning) setListWarning(j.warning as string);
      // ensure value is valid
      const first = (j.options as Option[] | undefined)?.[0]?.key ?? "";
      setValue(first || "");
    } catch (e: any) {
      setListError(e?.message || "Failed to load options");
    } finally {
      setLoadingList(false);
    }
  }

  async function loadData() {
    if (!paramUsed || !value) return;
    setLoadingData(true);
    setDataError(null);
    setRows([]);
    try {
      const qs = new URLSearchParams({
        dataset,
        param: paramUsed,
        value,
        year,
      });
      if (freq) qs.set("freq", freq);
      const r = await fetch(`/api/bea?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch data");
      const arr: Row[] = Array.isArray(j.rows) ? j.rows : [];
      setRows(arr);
    } catch (e: any) {
      setDataError(e?.message || "Error");
    } finally {
      setLoadingData(false);
    }
  }

  // chart series (use the first “line” as default)
  const primarySeries = useMemo(() => {
    const asc = sortAsc(rows.filter((r) => r.value != null));
    const byLine = new Map<string, Row[]>();
    for (const r of asc) {
      const k = r.line || "all";
      if (!byLine.has(k)) byLine.set(k, []);
      byLine.get(k)!.push(r);
    }
    const firstKey = [...byLine.keys()][0];
    const series = (firstKey ? byLine.get(firstKey) : asc) ?? [];
    return series.map((r) => ({ x: parsePeriod(r.time), y: r.value as number }));
  }, [rows]);

  // derive cadence for labels
  const cadence = useMemo(() => inferCadence(rows), [rows]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <section className="mx-auto max-w-6xl px-4 py-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">BEA Data Explorer</h1>
          <p className="text-sm text-gray-600 mt-1">
            Browse BEA datasets with an intuitive selector. Pick a dataset, choose a table/indicator, then pull clean trends.
          </p>
        </div>

        {/* Controls */}
        <div className="rounded-2xl border bg-white p-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Dataset */}
            <label className="flex flex-col">
              <span className="text-sm text-gray-700 mb-1">Dataset</span>
              <select
                value={dataset}
                onChange={(e) => setDataset(e.target.value as DatasetKey)}
                className="border rounded-md px-3 py-2"
              >
                {DATASETS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
              {DATASETS.find((d) => d.key === dataset)?.hint && (
                <span className="text-[11px] text-gray-500 mt-1">
                  {DATASETS.find((d) => d.key === dataset)!.hint}
                </span>
              )}
            </label>

            {/* Selector (paramUsed) */}
            <label className="flex flex-col">
              <span className="text-sm text-gray-700 mb-1">
                {loadingList ? "Loading options…" : paramUsed ? `${paramUsed} options` : "Selector"}
              </span>
              <select
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="border rounded-md px-3 py-2"
                disabled={!paramUsed || loadingList || options.length === 0}
              >
                {options.length === 0 ? (
                  <option value="">— No options —</option>
                ) : (
                  options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.key} — {o.desc}
                    </option>
                  ))
                )}
              </select>
              {listWarning && <span className="text-[11px] text-amber-700 mt-1">{listWarning}</span>}
              {listError && <span className="text-[12px] text-red-600 mt-1">Error: {listError}</span>}
            </label>
          </div>

          {/* Secondary controls */}
          <div className="mt-3 grid md:grid-cols-3 gap-4">
            <label className="flex flex-col">
              <span className="text-sm text-gray-700 mb-1">Years</span>
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="border rounded-md px-3 py-2"
                placeholder="LAST10 or 1999-2024 or 2020"
              />
              <span className="text-[11px] text-gray-500 mt-1">
                Try <code>LAST10</code>, <code>2010-2024</code>, or a single year.
              </span>
            </label>

            <label className="flex flex-col">
              <span className="text-sm text-gray-700 mb-1">Frequency (optional)</span>
              <select value={freq} onChange={(e) => setFreq(e.target.value)} className="border rounded-md px-3 py-2">
                <option value="">(auto / not required)</option>
                <option value="A">Annual</option>
                <option value="Q">Quarterly</option>
                <option value="M">Monthly</option>
              </select>
            </label>

            <div className="flex items-end gap-2">
              <button
                onClick={loadData}
                className="rounded-full bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
                disabled={loadingData || !paramUsed || !value}
              >
                {loadingData ? "Loading…" : "Get data"}
              </button>
              <button
                onClick={() => loadOptions(dataset)}
                className="rounded-full border px-4 py-2 text-sm"
                disabled={loadingList}
              >
                {loadingList ? "Refreshing…" : "Refresh list"}
              </button>
            </div>
          </div>
        </div>

        {/* Errors */}
        {dataError && <div className="text-red-600 text-sm mt-4">Error: {dataError}</div>}

        {/* Results */}
        <div className="mt-6 grid lg:grid-cols-[1.2fr_1fr] gap-6">
          {/* Chart card */}
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Trend (first line / series)</div>
              <div className="text-xs text-gray-500">
                {rows.length > 0 ? `${rows[0].unit ?? ""}` : ""}
              </div>
            </div>
            <div className="mt-3">
              {primarySeries.length >= 2 ? (
                <>
                  <LineChart series={primarySeries} />
                  {/* x-axis labels (light) */}
                  <div className="mt-2 grid grid-cols-5 text-[11px] text-gray-500">
                    {primarySeries.length > 0 &&
                      [0, 0.25, 0.5, 0.75, 1].map((t, i) => {
                        const idx = Math.max(0, Math.min(primarySeries.length - 1, Math.round((primarySeries.length - 1) * t)));
                        return <div key={i}>{xLabel(primarySeries[idx].x, cadence)}</div>;
                      })}
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-600">Run a query to see the trend.</div>
              )}
            </div>
          </div>

          {/* Data table */}
          <div className="rounded-2xl border bg-white p-4 overflow-auto">
            <div className="text-sm font-medium mb-2">Table</div>
            {rows.length === 0 ? (
              <div className="text-sm text-gray-600">No rows yet. Choose a selector and click “Get data”.</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-2 pr-3">Period</th>
                    <th className="py-2 pr-3">Line</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {sortAsc(rows).map((r, i) => (
                    <tr key={`${r.time}-${r.line}-${i}`} className="border-t">
                      <td className="py-2 pr-3">{r.time}</td>
                      <td className="py-2 pr-3 text-gray-500">{r.line}</td>
                      <td className="py-2 pr-3">{r.lineDesc || "—"}</td>
                      <td className="py-2 pr-3">{r.value == null ? "—" : r.value.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footnote */}
        <div className="mt-8 text-xs text-gray-500">
          Source: U.S. Bureau of Economic Analysis (BEA). Data fetched live via the BEA API.
        </div>
      </section>
    </main>
  );
}
