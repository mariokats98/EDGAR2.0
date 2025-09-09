"use client";

import { useEffect, useMemo, useState } from "react";

/* ---------- tiny bar chart (distribution across states) ---------- */
function TinyBars({ values }: { values: number[] }) {
  if (!values || values.length === 0) return null;
  const w = 260, h = 80, pad = 8;
  const min = Math.min(...values), max = Math.max(...values);
  const n = values.length;
  const bw = Math.max(1, (w - pad * 2) / n);
  const sy = (v: number) => (max === min ? h / 2 : h - pad - ((v - min) / (max - min)) * (h - pad * 2));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="distribution">
      <rect x={pad} y={pad} width={w - pad * 2} height={h - pad * 2} fill="none" stroke="#e5e7eb" />
      {values.map((v, i) => {
        const x = pad + i * bw;
        const y = sy(v);
        const barH = h - pad - y;
        return <rect key={i} x={x + 0.5} y={y} width={Math.max(0.5, bw - 1)} height={Math.max(1, barH)} fill="#0f172a" />;
      })}
    </svg>
  );
}

type VarMeta = { name: string; label: string; concept: string; group: string | null; predicateType: string };

export default function CensusPage() {
  // Controls
  const [dataset, setDataset] = useState("acs/acs5");
  const [vintage, setVintage] = useState("2023"); // ACS latest commonly available
  const [vars, setVars] = useState<VarMeta[]>([]);
  const [selectedVar, setSelectedVar] = useState("B19013_001E"); // Median household income
  const [loadingVars, setLoadingVars] = useState(false);
  const isTimeseries = dataset.toLowerCase().startsWith("timeseries/");

  // Explorer data (state-level)
  const [dataLoading, setDataLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Key indicator cards (national level)
  const [cards, setCards] = useState<
    { title: string; value: string; note?: string }[]
  >([
    { title: "U.S. Population (PEP 2023)", value: "—" },
    { title: "Median Household Income (ACS 5-yr 2023)", value: "—" },
    { title: "Bachelor’s Degree or Higher % (ACS Profile 2023)", value: "—" },
  ]);

  /* Load variable list */
  useEffect(() => {
    async function run() {
      setLoadingVars(true);
      setError(null);
      setVars([]);
      try {
        const qs = new URLSearchParams({
          dataset,
          vintage: isTimeseries ? "none" : vintage,
        });
        const r = await fetch(`/api/census/variables?${qs.toString()}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed to load variables");
        setVars(j.variables || []);
        // keep current selection if still valid; else pick a sensible default
        if (!j.variables.some((v: VarMeta) => v.name === selectedVar)) {
          const fallback =
            j.variables.find((v: VarMeta) => v.name.endsWith("_E")) ||
            j.variables[0];
          if (fallback?.name) setSelectedVar(fallback.name);
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

  /* Fetch state-level data for explorer */
  async function fetchData() {
    setDataLoading(true);
    setError(null);
    setRows([]);
    try {
      const qs = new URLSearchParams({
        dataset,
        vintage: isTimeseries ? "none" : vintage,
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

  /* Key Indicators (national) */
  useEffect(() => {
    async function loadCards() {
      try {
        // 1) US Population (PEP 2023): dataset pep/population, variable POP, for=us:1
        const popQs = new URLSearchParams({
          dataset: "pep/population",
          vintage: "2023",
          get: "NAME,POP",
          "for": "us:1",
        });
        const popR = await fetch(`/api/census/data?${popQs.toString()}`, { cache: "no-store" });
        const popJ = await popR.json();
        const popVal = popR.ok ? Number(popJ?.data?.[0]?.POP || 0) : 0;

        // 2) Median HH Income (ACS 5-yr 2023): B19013_001E, for=us:1
        const incQs = new URLSearchParams({
          dataset: "acs/acs5",
          vintage: "2023",
          get: "NAME,B19013_001E",
          "for": "us:1",
        });
        const incR = await fetch(`/api/census/data?${incQs.toString()}`, { cache: "no-store" });
        const incJ = await incR.json();
        const incVal = incR.ok ? Number(incJ?.data?.[0]?.B19013_001E || 0) : 0;

        // 3) Bachelor’s or Higher % (ACS PROFILE 2023): DP02_0068PE, for=us:1
        const eduQs = new URLSearchParams({
          dataset: "acs/acs5/profile",
          vintage: "2023",
          get: "NAME,DP02_0068PE",
          "for": "us:1",
        });
        const eduR = await fetch(`/api/census/data?${eduQs.toString()}`, { cache: "no-store" });
        const eduJ = await eduR.json();
        const eduVal = eduR.ok ? Number(eduJ?.data?.[0]?.DP02_0068PE || 0) : NaN;

        setCards([
          { title: "U.S. Population (PEP 2023)", value: popVal ? popVal.toLocaleString() : "—" },
          { title: "Median Household Income (ACS 5-yr 2023)", value: incVal ? `$${incVal.toLocaleString()}` : "—" },
          { title: "Bachelor’s Degree or Higher % (ACS Profile 2023)", value: Number.isFinite(eduVal) ? `${eduVal.toFixed(1)}%` : "—" },
        ]);
      } catch {
        // If any fail, leave placeholders
      }
    }
    void loadCards();
  }, []);

  const numericSeries = useMemo(() => {
    const arr = [...rows].sort((a, b) => (a.NAME < b.NAME ? -1 : 1));
    const vals = arr.map((r) => Number(r[selectedVar]));
    return { labels: arr.map((r) => r.NAME), values: vals.filter((n) => Number.isFinite(n)) };
  }, [rows, selectedVar]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">U.S. Census</h1>
      <p className="text-gray-600 text-sm mb-6">
        Key indicators at a glance, plus an explorer for ACS/PEP/timeseries datasets.
      </p>

      {/* Key indicators */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {cards.map((c, i) => (
          <div key={i} className="rounded-2xl border bg-white p-4">
            <div className="text-sm text-gray-600">{c.title}</div>
            <div className="mt-1 text-2xl font-semibold">{c.value}</div>
          </div>
        ))}
      </section>

      {/* Explorer */}
      <section className="rounded-2xl border bg-white p-4">
        <div className="grid md:grid-cols-4 gap-3">
          <label className="block">
            <div className="text-sm text-gray-700">Dataset</div>
            <select
              className="border rounded-md px-3 py-2 w-full"
              value={dataset}
              onChange={(e) => {
                const v = e.target.value;
                setDataset(v);
                // if timeseries selected, vintage ignored by API path
                if (v.toLowerCase().startsWith("timeseries/")) setVintage("none");
                else if (vintage === "none") setVintage("2023");
              }}
            >
              <option value="acs/acs5">ACS 5-year</option>
              <option value="acs/acs1">ACS 1-year</option>
              <option value="acs/acs5/profile">ACS 5-year (Profile)</option>
              <option value="pep/population">Population Estimates (PEP)</option>
              <option value="timeseries/poverty/saipe">SAIPE (Poverty, timeseries)</option>
            </select>
          </label>

          <label className="block">
            <div className="text-sm text-gray-700">Vintage</div>
            <select
              className="border rounded-md px-3 py-2 w-full disabled:opacity-60"
              value={vintage}
              disabled={isTimeseries}
              onChange={(e) => setVintage(e.target.value)}
            >
              {isTimeseries ? (
                <option value="none">—</option>
              ) : (
                <>
                  <option value="2023">2023</option>
                  <option value="2022">2022</option>
                  <option value="2021">2021</option>
                  <option value="2020">2020</option>
                  <option value="2019">2019</option>
                </>
              )}
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
            <div className="text-sm font-medium mb-2">Distribution across states</div>
            <TinyBars values={numericSeries.values} />
            <div className="text-[11px] text-gray-500 mt-2">
              Tip: choose an “_E” estimate variable for readable values (e.g., B19013_001E).
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
                    <tr key={r.state || r.NAME} className="border-b last:border-0">
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
        Data via U.S. Census API. “timeseries/…” datasets ignore the vintage selector by design.
      </p>
    </div>
  );
}