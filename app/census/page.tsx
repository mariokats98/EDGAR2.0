"use client";

import { useEffect, useMemo, useState } from "react";

/** Minimal inline line chart (like your other pages) */
function TinyLine({ points }: { points: number[] }) {
  if (!points || points.length < 2) return null;
  const w = 240, h = 80, pad = 8;
  const min = Math.min(...points), max = Math.max(...points);
  const dx = (w - pad * 2) / (points.length - 1);
  const sy = (v: number) => (max === min ? h / 2 : h - pad - ((v - min) / (max - min)) * (h - pad * 2));
  let d = `M ${pad},${sy(points[0])}`;
  for (let i = 1; i < points.length; i++) d += ` L ${pad + i * dx},${sy(points[i])}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <rect x={pad} y={pad} width={w - pad * 2} height={h - pad * 2} fill="none" stroke="#e5e7eb" />
      <path d={d} fill="none" stroke="#0f172a" strokeWidth={2} />
    </svg>
  );
}

type VarMeta = { name: string; label: string; concept: string; group: string | null; predicateType: string };

export default function CensusPage() {
  // Basic controls
  const [dataset, setDataset] = useState("acs/acs5");
  const [vintage, setVintage] = useState("2022");
  const [vars, setVars] = useState<VarMeta[]>([]);
  const [selectedVar, setSelectedVar] = useState("B01001_001E"); // Total population
  const [loadingVars, setLoadingVars] = useState(false);

  // Data
  const [dataLoading, setDataLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load variable list when dataset/vintage changes
  useEffect(() => {
    async function run() {
      setLoadingVars(true);
      setError(null);
      setVars([]);
      try {
        const qs = new URLSearchParams({ dataset, vintage });
        const r = await fetch(`/api/census/variables?${qs.toString()}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed to load variables");
        setVars(j.variables || []);
        // If current selection not present, fall back to first numeric estimate var
        if (!j.variables.some((v: VarMeta) => v.name === selectedVar)) {
          const firstEst = j.variables.find((v: VarMeta) => v.name.endsWith("_E"));
          setSelectedVar(firstEst?.name || j.variables[0]?.name || "");
        }
      } catch (e: any) {
        setError(e.message || "Error loading variables");
      } finally {
        setLoadingVars(false);
      }
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, vintage]);

  async function fetchData() {
    setDataLoading(true);
    setError(null);
    setRows([]);
    try {
      // Example: state level, ACS 5-year
      const qs = new URLSearchParams({
        dataset,
        vintage,
        get: `NAME,${selectedVar}`,
        "for": "state:*",
      });
      const r = await fetch(`/api/census/data?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch data");
      setRows(j.data || []);
    } catch (e: any) {
      setError(e.message || "Error fetching data");
    } finally {
      setDataLoading(false);
    }
  }

  const numericSeries = useMemo(() => {
    // Sort states A→Z and map the chosen var to numbers
    const arr = [...rows].sort((a, b) => (a.NAME < b.NAME ? -1 : 1));
    const nums = arr.map((r) => Number(r[selectedVar]));
    return { labels: arr.map((r) => r.NAME), values: nums };
  }, [rows, selectedVar]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">U.S. Census Explorer</h1>
      <p className="text-gray-600 text-sm mb-4">
        Browse popular Census datasets (ACS, Population Estimates, etc.). Choose a variable and pull state-level data instantly.
      </p>

      <section className="rounded-2xl border bg-white p-4">
        <div className="grid md:grid-cols-4 gap-3">
          <label className="block">
            <div className="text-sm text-gray-700">Dataset</div>
            <select
              className="border rounded-md px-3 py-2 w-full"
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
            >
              <option value="acs/acs5">ACS 5-year (default)</option>
              <option value="acs/acs1">ACS 1-year</option>
              <option value="pep/population">Population Estimates (PEP)</option>
              <option value="timeseries/poverty/saipe">SAIPE (Poverty)</option>
            </select>
          </label>

          <label className="block">
            <div className="text-sm text-gray-700">Vintage</div>
            <select
              className="border rounded-md px-3 py-2 w-full"
              value={vintage}
              onChange={(e) => setVintage(e.target.value)}
            >
              {/* Adjust as needed; ACS 5-year supports many vintages */}
              <option value="2023">2023</option>
              <option value="2022">2022</option>
              <option value="2021">2021</option>
              <option value="2020">2020</option>
              <option value="2019">2019</option>
            </select>
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm text-gray-700">Variable</div>
            <select
              className="border rounded-md px-3 py-2 w-full"
              value={selectedVar}
              onChange={(e) => setSelectedVar(e.target.value)}
              disabled={loadingVars}
            >
              {loadingVars && <option>Loading…</option>}
              {!loadingVars &&
                vars.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} — {v.label}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={dataLoading}
            className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60"
          >
            {dataLoading ? "Getting…" : "Get data"}
          </button>
          {error && <span className="text-sm text-red-600">Error: {error}</span>}
        </div>

        {/* Results */}
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border p-3">
            <div className="text-sm font-medium mb-2">Quick chart (states)</div>
            <TinyLine points={numericSeries.values.filter((n) => Number.isFinite(n))} />
            <div className="text-xs text-gray-600 mt-2">
              Variable: <code>{selectedVar}</code> • States: {rows.length}
            </div>
          </div>

          <div className="rounded-lg border p-3 overflow-auto">
            <div className="text-sm font-medium mb-2">Table</div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1 pr-3">State</th>
                  <th className="py-1">Value</th>
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) => (a.NAME < b.NAME ? -1 : 1))
                  .map((r) => (
                    <tr key={r.state} className="border-b last:border-0">
                      <td className="py-1 pr-3">{r.NAME}</td>
                      <td className="py-1">{r[selectedVar]}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <p className="text-[11px] text-gray-500 mt-3">
        Data via U.S. Census API. Some datasets require different vintages/parameters; this page shows a safe default flow.
      </p>
    </div>
  );
}