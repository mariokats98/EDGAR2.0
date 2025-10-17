// app/census/page.tsx
"use client";

import * as React from "react";

type Row = {
  date: string | null;
  value: number | string | null;
  name: string | null;
  unit: string | null;
};

type ApiResponse =
  | { data: Row[]; error?: undefined }
  | { data: Row[]; error: string };

const presetIndicators = [
  "Population",
  "GDP",
  "CPI",
  "Unemployment Rate",
  "PPI",
  "Retail Sales",
  "Industrial Production",
  "Consumer Confidence",
];

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const fmt = (v: unknown) => (v == null || v === "" ? "—" : String(v));
const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString();
};

export default function CensusPage() {
  // Indicator name
  const [name, setName] = React.useState<string>("Population");
  const debouncedName = useDebounced(name, 250);

  // Dates
  const [start, setStart] = React.useState<string>("");
  const [end, setEnd] = React.useState<string>("");

  // Fetching
  const [data, setData] = React.useState<Row[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0); // Search button forces refresh

  const buildUrl = React.useCallback(() => {
    const url = new URL("/api/census/data", window.location.origin);
    if (debouncedName.trim()) url.searchParams.set("name", debouncedName.trim());
    if (start) url.searchParams.set("start", start);
    if (end) url.searchParams.set("end", end);
    url.searchParams.set("limit", "1000");
    return url.toString();
  }, [debouncedName, start, end]);

  React.useEffect(() => {
    const controller = new AbortController();

    async function run() {
      if (!debouncedName.trim()) {
        setData([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(buildUrl(), {
          signal: controller.signal,
          headers: { "cache-control": "no-store" },
        });
        const json: ApiResponse = await res.json();
        if (!res.ok) {
          setError(json?.error || `HTTP ${res.status}`);
          setData([]);
        } else if ("error" in json && json.error) {
          setError(json.error);
          setData(json.data || []);
        } else {
          setData(Array.isArray(json.data) ? json.data : []);
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setError(e?.message || "Unexpected error");
          setData([]);
        }
      } finally {
        setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [buildUrl, debouncedName, refreshKey]);

  const onSearch = () => setRefreshKey((k) => k + 1);
  const onReset = () => {
    setName("Population");
    setStart("");
    setEnd("");
    setRefreshKey((k) => k + 1);
  };

  // Build sparkline (last up to 30 obs, chronological)
  const spark = React.useMemo(() => {
    const rows = (data || []).slice(0, 30).slice().reverse();
    const values = rows
      .map((r) => (typeof r.value === "string" ? Number(r.value) : (r.value as number)))
      .filter((v) => Number.isFinite(v)) as number[];
    if (values.length < 2) return null;
    const w = 120, h = 28, pad = 2;
    const min = Math.min(...values), max = Math.max(...values);
    const norm = (v: number) =>
      max === min ? h / 2 : h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    const step = (w - pad * 2) / (values.length - 1);
    const d = values
      .map((v, i) => `${i === 0 ? "M" : "L"}${pad + i * step},${norm(v)}`)
      .join(" ");
    return { d, w, h };
  }, [data]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div style={wrap}>
        <header style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Census & Macro (FMP)</h2>
          <p style={{ margin: "6px 0 0", color: "var(--muted)" as any }}>
            Explore economic indicators via FMP (e.g., <em>Population</em>, <em>GDP</em>, <em>CPI</em>, <em>Unemployment Rate</em>).
          </p>
        </header>

        {/* Controls */}
        <div style={toolbar} aria-label="Filters">
          <div className="relative">
            <input
              aria-label="Indicator name"
              list="indicator-list"
              placeholder="e.g., Population"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
              className="h-10 w-full rounded-lg border px-3 text-sm outline-none bg-white"
            />
            <datalist id="indicator-list">
              {presetIndicators.map((p) => <option key={p} value={p} />)}
            </datalist>
            <div className="mt-1 text-[11px] text-gray-500">
              Must match FMP’s indicator <code>name</code> (e.g., <code>Population</code>, <code>GDP</code>, <code>CPI</code>).
            </div>
          </div>

          <div style={dateWrap}>
            <label style={label}>
              <span style={lblTxt}>Start</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={dateInput} />
            </label>
            <label style={label}>
              <span style={lblTxt}>End</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={dateInput} />
            </label>
          </div>

          <div style={btnRow}>
            <button onClick={onSearch} disabled={loading} style={primaryBtn}>
              {loading ? "Searching…" : "Search"}
            </button>
            <button onClick={onReset} disabled={loading} style={ghostBtn}>
              Reset
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div role="alert" style={errBox}>
            <strong>Couldn’t load results.</strong>
            <div style={{ marginTop: 6 }}>{error}</div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
              Try a different indicator name or adjust dates.
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && <div style={muted}>Loading…</div>}

        {/* Sparkline */}
        {!loading && !error && data && data.length > 1 && spark && (
          <div style={{ margin: "8px 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width={spark.w} height={spark.h} viewBox={`0 0 ${spark.w} ${spark.h}`}>
              <path d={spark.d} fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span style={{ fontSize: 12, color: "var(--muted)" as any }}>
              Last {Math.min(30, data.length)} observations
            </span>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && data && data.length === 0 && (
          <div style={emptyBox}>
            <div>No results found for “{name}”.</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
              Try a different indicator (e.g., GDP, CPI, Unemployment Rate).
            </div>
          </div>
        )}

        {/* Table */}
        {!loading && !error && data && data.length > 0 && (
          <div style={{ overflow: "auto", borderRadius: 10, border: "1px solid var(--line)" }}>
            <table style={tbl}>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Indicator</Th>
                  <Th>Value</Th>
                  <Th>Unit</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={i} style={i % 2 ? trAlt : undefined}>
                    <Td>{fmtDate(r.date)}</Td>
                    <Td>{fmt(r.name)}</Td>
                    <Td>{fmt(r.value)}</Td>
                    <Td>{fmt(r.unit)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

/* tiny elements */
function Th({ children }: { children: React.ReactNode }) { return <th style={th}>{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td style={td}>{children}</td>; }

/* styles */
const wrap: React.CSSProperties = {
  ["--muted" as any]: "#6b7280",
  ["--line" as any]: "rgba(0,0,0,0.1)",
  ["--bgAlt" as any]: "rgba(0,0,0,0.03)",
  color: "#0f172a",
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans"',
};

const toolbar: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) auto auto",
  gap: 12,
  alignItems: "center",
  margin: "12px 0 14px",
};

const dateWrap: React.CSSProperties = {
  display: "inline-flex",
  gap: 8,
  alignItems: "center",
};

const label: React.CSSProperties = { display: "inline-flex", flexDirection: "column", gap: 4 };
const lblTxt: React.CSSProperties = { fontSize: 11, color: "var(--muted)" as any };
const dateInput: React.CSSProperties = {
  height: 34,
  borderRadius: 8,
  border: "1px solid var(--line)",
  padding: "0 8px",
  fontSize: 13,
  background: "#fff",
};

const btnRow: React.CSSProperties = { display: "inline-flex", gap: 8, alignItems: "center" };
const baseBtn: React.CSSProperties = {
  height: 38,
  borderRadius: 10,
  padding: "0 14px",
  fontSize: 14,
  cursor: "pointer",
  border: "1px solid var(--line)",
};
const primaryBtn: React.CSSProperties = {
  ...baseBtn,
  background: "#111827",
  color: "#fff",
  border: "1px solid #111827",
};
const ghostBtn: React.CSSProperties = {
  ...baseBtn,
  background: "#fff",
};

const errBox: React.CSSProperties = {
  border: "1px solid #ef4444",
  background: "#fef2f2",
  color: "#991b1b",
  padding: 12,
  borderRadius: 10,
  marginBottom: 12,
};

const muted: React.CSSProperties = { padding: "8px 0 14px", color: "var(--muted)" as any };
const emptyBox: React.CSSProperties = { padding: 20, border: "1px dashed var(--line)", borderRadius: 10, textAlign: "center", marginTop: 8 };

const tbl: React.CSSProperties = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 14 };

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontWeight: 700,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "var(--muted)" as any,
  position: "sticky",
  top: 0,
  background: "#fff",
  borderBottom: "1px solid var(--line)",
};

const td: React.CSSProperties = { padding: "12px", borderTop: "1px solid var(--line)", verticalAlign: "top", whiteSpace: "nowrap" };
const trAlt: React.CSSProperties = { background: "var(--bgAlt)" };