"use client";

import { useEffect, useMemo, useState } from "react";

type TableRow = string[];

async function getJSON(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export default function CensusPage() {
  const [dataset, setDataset] = useState<"acs/acs5" | "timeseries/eits/marts">("acs/acs5");
  const [year, setYear] = useState("latest");        // annual only
  const [geoFor, setGeoFor] = useState("us:1");      // annual only
  const [timeStr, setTimeStr] = useState("from 2021-01 to 2025-12"); // timeseries only
  const [variables, setVariables] = useState("NAME,B01001_001E");    // changes per dataset
  const [category, setCategory] = useState("44X72"); // MARTS: total retail & food services

  const [vars, setVars] = useState<any>({});
  const [varsLoading, setVarsLoading] = useState(false);
  const [varsErr, setVarsErr] = useState<string | null>(null);

  const [rows, setRows] = useState<TableRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isTimeseries = dataset.startsWith("timeseries/");

  // Load variables list
  useEffect(() => {
    setVarsLoading(true);
    setVarsErr(null);
    setVars({});
    const params = new URLSearchParams({ dataset });
    if (!isTimeseries) params.set("year", year || "latest");
    getJSON(`/api/census/variables?${params.toString()}`)
      .then((j) => setVars(j?.data?.variables || j?.variables || {}))
      .catch((e) => setVarsErr(e.message || "Failed to load variables"))
      .finally(() => setVarsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, year]);

  // Set sensible defaults per dataset
  useEffect(() => {
    if (isTimeseries) {
      setVariables("cell_value,category_code,seasonally_adj,time");
    } else {
      setVariables("NAME,B01001_001E");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);

  async function run() {
    setLoading(true);
    setErr(null);
    setRows(null);
    try {
      const qs = new URLSearchParams({ dataset, get: variables });
      if (isTimeseries) {
        qs.set("time", timeStr);
        if (category) qs.set("category_code", category); // MARTS filter
      } else {
        qs.set("year", year || "latest");
        qs.set("for", geoFor || "us:1");
      }
      const j = await getJSON(`/api/census/data?${qs.toString()}`);
      const data: TableRow[] = j?.data;
      if (!Array.isArray(data) || data.length === 0) throw new Error("No data");
      setRows(data);
    } catch (e: any) {
      setErr(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }

  // Chart helper: pick x=time (if present) else first col; y=first numeric col after x
  const chartMeta = useMemo(() => {
    if (!rows || rows.length < 2) return null;
    const header = rows[0];
    let xIdx = header.findIndex((h) => /time|date/i.test(h));
    if (xIdx < 0) xIdx = 0;
    let yIdx = header.findIndex((h, i) => i !== xIdx && rows.slice(1).some((r) => Number.isFinite(Number(r[i]))));
    if (yIdx < 0) yIdx = 1;
    return { xIdx, yIdx, header };
  }, [rows]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <section className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold">U.S. Census</h1>
        <p className="text-gray-600 text-sm mb-4">Live queries with correct parameters for each dataset.</p>

        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <label>
              <div className="text-sm text-gray-700">Dataset</div>
              <select
                value={dataset}
                onChange={(e) => setDataset(e.target.value as any)}
                className="border rounded-md px-3 py-2"
              >
                <option value="acs/acs5">ACS 5-year (annual)</option>
                <option value="timeseries/eits/marts">Retail Trade (MARTS, timeseries)</option>
              </select>
            </label>

            {!isTimeseries && (
              <>
                <label>
                  <div className="text-sm text-gray-700">Year (or “latest”)</div>
                  <input value={year} onChange={(e) => setYear(e.target.value)} className="border rounded-md px-3 py-2 w-28" />
                </label>
                <label>
                  <div className="text-sm text-gray-700">Geography (for)</div>
                  <input value={geoFor} onChange={(e) => setGeoFor(e.target.value)} className="border rounded-md px-3 py-2 w-36" placeholder="us:1" />
                </label>
              </>
            )}

            {isTimeseries && (
              <>
                <label>
                  <div className="text-sm text-gray-700">Time window</div>
                  <input
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                    className="border rounded-md px-3 py-2 w-64"
                    placeholder="from 2021-01 to 2025-12"
                  />
                </label>
                <label>
                  <div className="text-sm text-gray-700">category_code</div>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="border rounded-md px-3 py-2 w-28"
                    placeholder="44X72"
                  />
                </label>
              </>
            )}

            <label className="flex-1 min-w-[260px]">
              <div className="text-sm text-gray-700">
                Variables {varsLoading ? <span className="text-xs text-gray-500">(loading…)</span> : null}
              </div>
              <input value={variables} onChange={(e) => setVariables(e.target.value)} className="border rounded-md px-3 py-2 w-full" />
            </label>

            <button
              onClick={run}
              disabled={loading || varsLoading}
              className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60 h-[38px] self-end"
            >
              {loading ? "Getting…" : "Get data"}
            </button>
          </div>

          {varsErr ? (
            <div className="text-sm text-red-600">Variables error: {varsErr}</div>
          ) : (
            <details className="mt-1">
              <summary className="text-sm text-gray-700 cursor-pointer">Browse variables (first 30)</summary>
              <div className="mt-2 max-h-48 overflow-auto rounded border">
                <ul className="text-xs">
                  {Object.entries(vars)
                    .slice(0, 30)
                    .map(([k, meta]: any) => (
                      <li key={k} className="px-3 py-1 border-b last:border-0">
                        <code className="font-mono">{k}</code> — {meta?.label || ""}
                      </li>
                    ))}
                </ul>
              </div>
            </details>
          )}
        </div>

        <div className="mt-6">
          {err && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

          {rows && (
            <>
              <div className="rounded-2xl border bg-white p-4 overflow-x-auto">
                <div className="text-sm font-medium mb-2">Data (first 200 rows)</div>
                <table className="min-w-[720px] text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      {rows[0].map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium text-gray-700 border-b">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(1, 201).map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {r.map((c, j) => (
                          <td key={j} className="px-3 py-2 whitespace-nowrap">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 201 && <div className="text-xs text-gray-500 mt-2">Showing first 200 rows.</div>}
              </div>
            </>
          )}

          {!rows && !err && <div className="text-sm text-gray-600">Pick a dataset and click “Get data”.</div>}
        </div>
      </section>
    </main>
  );
}