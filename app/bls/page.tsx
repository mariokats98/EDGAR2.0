"use client";

import { useEffect, useMemo, useState } from "react";

/** -----------------------------
 *  Friendly BLS UI with Tabs
 *  - Tab 1: Releases (auto-fetched)
 *  - Tab 2: Indicators (guided selection + custom IDs)
 *  - Inline sparklines, no chart libs needed
 *  - Uses /api/bls/releases and /api/bls/series
 *  ----------------------------- */

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
  code: string;               // CPI | PAYROLLS | UNRATE
  series: string;             // e.g., CUUR0000SA0
  name: string;               // friendly name
  typical_time_et: string;    // "08:30"
  next_release: string | null;// YYYY-MM-DD or null
  latest?: { date: string; value: number } | null;
};

// Curated categories most people care about (simple & reliable IDs)
const CATEGORIES: {
  name: string;
  items: { id: string; label: string; tip?: string }[];
}[] = [
  {
    name: "Prices & Inflation",
    items: [
      { id: "CUUR0000SA0", label: "CPI-U: All Items (SA)", tip: "Headline CPI, seasonally adjusted" },
    ],
  },
  {
    name: "Labor Market",
    items: [
      { id: "LNS14000000", label: "Unemployment Rate (SA)", tip: "Percent of labor force" },
      { id: "CES0000000001", label: "Nonfarm Payrolls (SA)", tip: "Thousands of jobs" },
    ],
  },
];

/** Tiny sparkline (no libs) */
function Spark({ data }: { data: SeriesObs[] }) {
  if (!data || data.length < 2) return null;
  const width = 180, height = 44, pad = 3;
  const xs = data.map((_, i) => i);
  const ys = data.map((d) => d.value);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = (width - pad * 2) / (xs.length - 1 || 1);
  const sy = (v: number) =>
    maxY === minY
      ? height / 2
      : height - pad - ((v - minY) / (maxY - minY)) * (height - pad * 2);
  const d = xs
    .map((_, i) => `${i === 0 ? "M" : "L"} ${pad + i * dx},${sy(ys[i])}`)
    .join(" ");
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

export default function BLSPage() {
  const [tab, setTab] = useState<"releases" | "indicators">("releases");

  // Releases state
  const [releases, setReleases] = useState<ReleaseRow[] | null>(null);
  const [relLoading, setRelLoading] = useState(false);

  // Indicators state
  const [ids, setIds] = useState<string>("CUUR0000SA0,LNS14000000"); // editable bag of series
  const [start, setStart] = useState("2018");
  const [end, setEnd] = useState(new Date().getFullYear().toString());
  const [freq, setFreq] = useState<"monthly" | "annual">("monthly");
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [series, setSeries] = useState<SeriesOut[]>([]);
  const [errorSeries, setErrorSeries] = useState<string | null>(null);

  // Auto-load releases on first visit to the tab
  useEffect(() => {
    if (tab === "releases" && releases === null && !relLoading) {
      void fetchReleases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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

  function addSeries(id: string) {
    const current = ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (!current.includes(id)) {
      setIds([...current, id].join(","));
    }
  }

  async function fetchSeries() {
    setLoadingSeries(true);
    setErrorSeries(null);
    setSeries([]);
    try {
      const qs = new URLSearchParams({ ids, start, end, freq });
      const r = await fetch(`/api/bls/series?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch");
      setSeries(Array.isArray(j.data) ? j.data : []);
    } catch (e: any) {
      setErrorSeries(e?.message || "Error");
    } finally {
      setLoadingSeries(false);
    }
  }

  const seriesCards = useMemo(
    () =>
      series.map((s) => (
        <div key={s.id} className="border rounded-lg p-3 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{s.title}</div>
              <div className="text-xs text-gray-600">
                <span className="mr-2">ID: <code>{s.id}</code></span>
                <span className="mr-2">Units: {s.units || "—"}</span>
                <span>{s.seasonal}</span>
              </div>
            </div>
            <div className="text-gray-800">
              <Spark data={s.observations.slice(-24)} />
            </div>
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
      )),
    [series]
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">BLS Economic Data</h1>
      <p className="text-gray-600 text-sm mb-4">
        See upcoming releases and pull historical indicators in a few clicks.
      </p>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        <button
          className={`px-3 py-2 text-sm rounded-md border ${tab === "releases" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"}`}
          onClick={() => setTab("releases")}
        >
          Upcoming Releases
        </button>
        <button
          className={`px-3 py-2 text-sm rounded-md border ${tab === "indicators" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"}`}
          onClick={() => setTab("indicators")}
        >
          Indicators & History
        </button>
      </div>

      {tab === "releases" && (
        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Major BLS Releases</h2>
            <div className="flex items-center gap-2">
              <a
                className="text-xs underline text-gray-700"
                href="https://www.bls.gov/schedule/news_release/"
                target="_blank"
              >
                BLS full calendar
              </a>
              <button
                onClick={fetchReleases}
                className="px-3 py-1 rounded-md bg-black text-white text-sm disabled:opacity-60"
                disabled={relLoading}
              >
                {relLoading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="mt-3 grid md:grid-cols-2 gap-3">
            {(releases || []).map((r, i) => (
              <div key={i} className="border rounded-lg p-3">
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-xs text-gray-600 mt-1">
                  Series: <code>{r.series}</code>
                </div>
                <div className="text-xs mt-1">
                  Typical time: <strong>{r.typical_time_et} ET</strong>
                </div>
                <div className="text-xs mt-1">
                  Next release: <strong>{r.next_release ?? "TBA"}</strong>
                </div>
                {r.latest && (
                  <div className="text-xs mt-1 text-gray-700">
                    Latest: {r.latest.date} → <strong>{r.latest.value}</strong>
                  </div>
                )}
              </div>
            ))}
            {!releases && (
              <div className="text-sm text-gray-600">Click “Refresh” to load releases.</div>
            )}
          </div>

          <div className="text-xs text-gray-500 mt-4">
            Tip: We parse the official BLS calendar. Set <code>BLS_CALENDAR_ICS_URL</code> in Vercel for the freshest dates.
          </div>
        </section>
      )}

      {tab === "indicators" && (
        <section className="grid md:grid-cols-[260px_1fr] gap-4">
          {/* Left: Friendly selector */}
          <aside className="rounded-2xl border bg-white p-4 h-fit">
            <div className="font-medium mb-2">Pick indicators</div>
            <div className="space-y-4">
              {CATEGORIES.map((cat) => (
                <div key={cat.name}>
                  <div className="text-sm text-gray-800 mb-2">{cat.name}</div>
                  <div className="flex flex-wrap gap-2">
                    {cat.items.map((it) => (
                      <button
                        key={it.id}
                        className="text-xs rounded-full bg-gray-100 hover:bg-gray-200 px-3 py-1"
                        title={it.tip || ""}
                        onClick={() => addSeries(it.id)}
                      >
                        + {it.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-600 mt-4">
              You can also enter BLS series IDs directly (comma-separated).
            </div>
          </aside>

          {/* Right: Query + Results */}
          <div className="rounded-2xl border bg-white p-4">
            {/* Controls */}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1">
                <div className="text-sm text-gray-700">Selected Series (comma-separated)</div>
                <input
                  value={ids}
                  onChange={(e) => setIds(e.target.value)}
                  className="border rounded-md w-full px-3 py-2"
                  placeholder="CUUR0000SA0,LNS14000000,CES0000000001"
                />
              </label>
              <label>
                <div className="text-sm text-gray-700">Start year</div>
                <input
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="border rounded-md px-3 py-2 w-28"
                />
              </label>
              <label>
                <div className="text-sm text-gray-700">End year</div>
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
                disabled={loadingSeries}
              >
                {loadingSeries ? "Getting…" : "Get data"}
              </button>
            </div>

            {/* Errors */}
            {errorSeries && (
              <div className="text-red-600 text-sm mt-3">Error: {errorSeries}</div>
            )}

            {/* Results */}
            <div className="mt-4 grid md:grid-cols-2 gap-3">
              {seriesCards}
              {!loadingSeries && series.length === 0 && (
                <div className="text-sm text-gray-600">
                  Choose indicators on the left or enter series IDs, then click “Get data”.
                </div>
              )}
            </div>

            <div className="text-xs text-gray-500 mt-4">
              Note: Titles & units are shown when available from the API. For large pulls, consider narrowing the date range.
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

