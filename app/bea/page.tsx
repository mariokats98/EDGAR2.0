"use client";

import { useEffect, useMemo, useState } from "react";

/** ------------------------------------------
 *  Minimal chart (brand-consistent, responsive)
 *  ------------------------------------------ */
function LineChart({
  data,
  height = 180,
  pad = 16,
}: {
  data: { date: string; value: number }[];
  height?: number;
  pad?: number;
}) {
  if (!data || data.length < 2) return null;
  // Ensure oldest → newest
  const s = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const width = 640;
  const ys = s.map((d) => d.value);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const yPad = (maxY - minY || 1) * 0.08;
  const y0 = minY - yPad;
  const y1 = maxY + yPad;
  const scaleY = (v: number) =>
    y1 === y0 ? height / 2 : height - pad - ((v - y0) / (y1 - y0)) * (height - pad * 2);
  const dx = (width - pad * 2) / (s.length - 1);

  let d = `M ${pad},${scaleY(ys[0])}`;
  for (let i = 1; i < s.length; i++) d += ` L ${pad + i * dx},${scaleY(ys[i])}`;
  const area = `${d} L ${width - pad},${height - pad} L ${pad},${height - pad} Z`;

  // X ticks ~8
  const tickCount = Math.min(8, s.length);
  const step = Math.max(1, Math.round((s.length - 1) / (tickCount - 1)));
  const tickIdxs = Array.from({ length: tickCount }, (_, i) => Math.min(i * step, s.length - 1));

  const label = (iso: string) => {
    const dte = new Date(iso);
    // If day is 01, show YYYY-MM, else show YYYY-MM-DD
    const fmt = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short" });
    const fmtFull = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" });
    return dte.getDate() === 1 ? fmt.format(dte) : fmtFull.format(dte);
    // (BEA returns monthly/quarterly/annual series too; this is still readable.)
  };

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend chart">
      {/* grid */}
      {Array.from({ length: 4 }).map((_, i) => {
        const y = pad + ((height - pad * 2) / 3) * i;
        return <line key={i} x1={pad} y1={y} x2={width - pad} y2={y} stroke="#e5e7eb" />;
      })}
      {/* border box */}
      <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill="none" stroke="#d1d5db" />
      {/* area + line */}
      <path d={area} fill="rgba(2,6,23,0.05)" />
      <path d={d} fill="none" stroke="#020617" strokeWidth={2} />
      {/* ticks */}
      {tickIdxs.map((idx, i) => {
        const x = pad + idx * dx;
        return (
          <g key={i}>
            <line x1={x} y1={height - pad} x2={x} y2={height - pad + 4} stroke="#9ca3af" />
            <text x={x} y={height - 2} fontSize="10" textAnchor="middle" fill="#6b7280">
              {label(s[idx].date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** ------------------------------------------
 *  Dataset → parameter schema (UI only)
 *  We’ll ask the backend for options for each param.
 *  ------------------------------------------ */
type DatasetKey = "NIPA" | "Regional" | "GDPByIndustry" | "InputOutput" | "ITA";

const DATASET_LABEL: Record<DatasetKey, string> = {
  NIPA: "NIPA (National Income & Product Accounts)",
  Regional: "Regional (State/County/MSA)",
  GDPByIndustry: "GDP by Industry",
  InputOutput: "Input-Output (Use/Make)",
  ITA: "International Transactions (ITA)",
};

// The order here defines the cascading UX per dataset.
// The string names must match BEA param names expected by your API routes.
const SCHEMA: Record<DatasetKey, string[]> = {
  NIPA: ["TableName", "Frequency", "Year", "Quarter"],
  Regional: ["TableName", "Geo", "LineCode", "Year"],
  GDPByIndustry: ["TableID", "Industry", "Frequency", "Year"],
  InputOutput: ["TableID", "Year", "Summary"],
  ITA: ["Indicator", "AreaOrCountry", "Frequency", "Year"],
};

// Friendly labels for inputs
const LABELS: Record<string, string> = {
  TableName: "Table",
  Frequency: "Frequency",
  Year: "Year",
  Quarter: "Quarter",
  Geo: "Geography",
  LineCode: "Line Code / Series",
  TableID: "Table",
  Industry: "Industry",
  Summary: "Summary Type",
  Indicator: "Indicator",
  AreaOrCountry: "Area / Country",
};

/** ------------------------------------------
 *  BEA Page with granular cascading dropdowns
 *  ------------------------------------------ */
export default function BEAPage() {
  const [dataset, setDataset] = useState<DatasetKey>("NIPA");

  // param->value map (resets when dataset changes)
  const [params, setParams] = useState<Record<string, string>>({});
  // options cache: dataset:param -> list
  const [options, setOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [loading, setLoading] = useState(false);
  const [series, setSeries] = useState<{ title?: string; units?: string; data: { date: string; value: number }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // reset params on dataset change
  useEffect(() => {
    const fresh: Record<string, string> = {};
    for (const p of SCHEMA[dataset]) fresh[p] = "";
    setParams(fresh);
    setSeries(null);
    setError(null);
  }, [dataset]);

  // helper key for options cache
  const keyFor = (ds: DatasetKey, param: string) => `${ds}:${param}`;

  // fetch options for a param (conditioned on previous picks)
  async function loadOptions(param: string) {
    try {
      const deps: Record<string, string> = {};
      for (const p of SCHEMA[dataset]) {
        if (p === param) break;
        if (params[p]) deps[p] = params[p];
      }
      const qs = new URLSearchParams({
        dataset,
        param,
        // pass dependencies as JSON
        deps: JSON.stringify(deps),
      });
      const r = await fetch(`/api/bea/options?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to load options");
      const list: { value: string; label: string }[] = Array.isArray(j?.data) ? j.data : [];
      setOptions((prev) => ({ ...prev, [keyFor(dataset, param)]: list }));
    } catch (e: any) {
      setOptions((prev) => ({ ...prev, [keyFor(dataset, param)]: [] }));
      console.error(e);
    }
  }

  // When a param changes: set value, clear downstream, load next param’s options
  function onParamChange(param: string, value: string) {
    setParams((prev) => {
      const next: Record<string, string> = { ...prev, [param]: value };
      // clear anything after this param in the cascade
      const order = SCHEMA[dataset];
      const idx = order.indexOf(param);
      for (let i = idx + 1; i < order.length; i++) next[order[i]] = "";
      return next;
    });
  }

  // Trigger initial options for the first param whenever dataset changes
  useEffect(() => {
    const first = SCHEMA[dataset][0];
    if (first) void loadOptions(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);

  // Whenever a param gets picked, fetch options for the *next* param
  useEffect(() => {
    const order = SCHEMA[dataset];
    // find first param that is empty; load its options if not present
    for (let i = 0; i < order.length; i++) {
      const p = order[i];
      if (!params[p]) {
        // ensure we have options
        const cacheKey = keyFor(dataset, p);
        if (!options[cacheKey]) void loadOptions(p);
        break;
      }
      // when p is filled, make sure next param options exist
      if (i + 1 < order.length) {
        const nextP = order[i + 1];
        const nextKey = keyFor(dataset, nextP);
        if (!options[nextKey]) void loadOptions(nextP);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, dataset]);

  // Ready to query?
  const readyToQuery = useMemo(() => {
    return SCHEMA[dataset].every((p) => !!params[p]);
  }, [dataset, params]);

  async function runQuery() {
    if (!readyToQuery) return;
    setLoading(true);
    setError(null);
    setSeries(null);
    try {
      const r = await fetch(`/api/bea/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ dataset, params }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Query failed");
      const out = { title: j.title || "BEA Series", units: j.units || "", data: j.data || [] };
      // sort chronological
      out.data = [...out.data].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setSeries(out);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  function ParamSelect({ name }: { name: string }) {
    const k = keyFor(dataset, name);
    const list = options[k] || [];
    const value = params[name] || "";
    const disabled = list.length === 0;

    return (
      <label className="flex-1 min-w-[200px]">
        <div className="text-sm text-gray-700">{LABELS[name] || name}</div>
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onParamChange(name, e.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2 disabled:opacity-50"
        >
          <option value="">{disabled ? "Loading…" : `Select ${LABELS[name] || name}`}</option>
          {list.map((o) => (
            <option key={o.value} value={o.value}>{o.label || o.value}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">BEA Data Explorer</h1>
          <p className="text-gray-600 text-sm mt-1">
            Pick a BEA dataset and refine with context-aware dropdowns. We’ll fetch a clean time series and draw a readable chart.
          </p>
        </header>

        {/* Dataset picker */}
        <section className="rounded-2xl border bg-white p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[240px]">
              <div className="text-sm text-gray-700">Dataset</div>
              <select
                value={dataset}
                onChange={(e) => setDataset(e.target.value as DatasetKey)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              >
                {(Object.keys(DATASET_LABEL) as DatasetKey[]).map((k) => (
                  <option key={k} value={k}>{DATASET_LABEL[k]}</option>
                ))}
              </select>
            </label>

            {/* Render the cascading params for the chosen dataset */}
            {SCHEMA[dataset].map((p) => (
              <ParamSelect key={p} name={p} />
            ))}

            <button
              onClick={runQuery}
              className="rounded-md bg-black text-white px-4 py-2 disabled:opacity-50"
              disabled={!readyToQuery || loading}
            >
              {loading ? "Loading…" : "Get Data"}
            </button>
          </div>
        </section>

        {/* Results */}
        <section className="rounded-2xl border bg-white p-5">
          {error && <div className="text-red-600 text-sm mb-3">Error: {error}</div>}

          {!error && !series && (
            <div className="text-sm text-gray-600">
              Choose a dataset and fill the dropdowns to enable <span className="font-medium">Get Data</span>.
            </div>
          )}

          {series && (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{series.title}</div>
                  <div className="text-xs text-gray-600">Units: {series.units || "—"}</div>
                </div>
                <div className="text-xs text-gray-500">
                  Observations: {series.data.length.toLocaleString()}
                </div>
              </div>
              <div className="mt-4">
                <LineChart data={series.data} />
              </div>
            </>
          )}
        </section>

        {/* Footer note */}
        <footer className="mt-8 text-center text-xs text-gray-500">
          Data: U.S. Bureau of Economic Analysis (BEA). This site republishes official public data.
        </footer>
      </div>
    </main>
  );
}
