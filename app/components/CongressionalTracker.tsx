"use client";

import * as React from "react";

type Chamber = "senate" | "house" | "all";
type Mode = "symbol" | "name";
type View = "search" | "latest";

type Row = {
  memberName: string | null;
  transactionDate: string | null;
  transactionType: string | null;
  ticker: string | null;
  assetName: string | null;
  assetType: string | null;
  owner: string | null;
  amount: string | null;
  sourceUrl: string | null;
  state: string | null;
  party: string | null;
};

type ApiResponse =
  | { data: Row[]; error?: undefined }
  | { data: Row[]; error: string };

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

export default function CongressionalTracker() {
  // New: Search vs Latest
  const [view, setView] = React.useState<View>("search");

  // For "search" view:
  const [mode, setMode] = React.useState<Mode>("symbol");
  const [chamber, setChamber] = React.useState<Chamber>("senate");
  const [rawQuery, setRawQuery] = React.useState("AAPL");
  const debouncedQuery = useDebounced(rawQuery, 300);

  // For "latest" view:
  const [latestChamber, setLatestChamber] = React.useState<Chamber>("all");

  // Date filters (apply to both views):
  const [start, setStart] = React.useState<string>(""); // YYYY-MM-DD
  const [end, setEnd] = React.useState<string>("");     // YYYY-MM-DD

  const [data, setData] = React.useState<Row[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Build URL for fetch based on current view/filters
  const buildUrl = React.useCallback(() => {
    const url = new URL("/api/congress", window.location.origin);
    url.searchParams.set("view", view);

    if (view === "search") {
      const q = debouncedQuery.trim();
      if (q) url.searchParams.set("q", q);
      url.searchParams.set("mode", mode);
      url.searchParams.set("chamber", chamber);
    } else {
      url.searchParams.set("chamber", latestChamber);
      // optional: you can expose a limit picker; default is server’s 200
      // url.searchParams.set("limit", "200");
    }

    if (start) url.searchParams.set("start", start);
    if (end) url.searchParams.set("end", end);

    return url.toString();
  }, [view, debouncedQuery, mode, chamber, latestChamber, start, end]);

  React.useEffect(() => {
    const controller = new AbortController();

    async function run() {
      // Validation: for search view, require q
      if (view === "search" && !debouncedQuery.trim()) {
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
  }, [buildUrl]);

  return (
    <div style={wrap}>
      <header style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Congressional Trades</h2>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" as any }}>
          Search by <strong>ticker</strong> or <strong>member name</strong>, or view the <strong>most recent</strong> disclosures.
        </p>
      </header>

      {/* View tabs: Search | Most Recent */}
      <div style={segWrap} role="tablist" aria-label="View">
        <button
          role="tab"
          aria-selected={view === "search"}
          onClick={() => setView("search")}
          style={view === "search" ? segActive : seg}
        >
          Search
        </button>
        <button
          role="tab"
          aria-selected={view === "latest"}
          onClick={() => setView("latest")}
          style={view === "latest" ? segActive : seg}
        >
          Most Recent
        </button>
      </div>

      {/* Filters row */}
      <div style={toolbar} aria-label="Filters">
        {view === "search" ? (
          <>
            {/* Search mode (Ticker / Name) */}
            <div style={segWrap} role="tablist" aria-label="Search mode">
              <button
                role="tab"
                aria-selected={mode === "symbol"}
                onClick={() => setMode("symbol")}
                style={mode === "symbol" ? segActive : seg}
              >
                Ticker
              </button>
              <button
                role="tab"
                aria-selected={mode === "name"}
                onClick={() => setMode("name")}
                style={mode === "name" ? segActive : seg}
              >
                Member name
              </button>
            </div>

            {/* Query input */}
            <input
              aria-label={mode === "symbol" ? "Ticker search" : "Member name search"}
              placeholder={mode === "symbol" ? "e.g., AAPL" : "e.g., Nancy Pelosi"}
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setRawQuery((v) => v.trim()); }}
              style={search}
            />

            {/* Chamber (Senate / House) */}
            <div style={segWrap} role="tablist" aria-label="Chamber">
              <button
                role="tab"
                aria-selected={chamber === "senate"}
                onClick={() => setChamber("senate")}
                style={chamber === "senate" ? segActive : seg}
              >
                Senate
              </button>
              <button
                role="tab"
                aria-selected={chamber === "house"}
                onClick={() => setChamber("house")}
                style={chamber === "house" ? segActive : seg}
              >
                House
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Latest chamber (All / Senate / House) */}
            <div style={segWrap} role="tablist" aria-label="Latest chamber">
              <button
                role="tab"
                aria-selected={latestChamber === "all"}
                onClick={() => setLatestChamber("all")}
                style={latestChamber === "all" ? segActive : seg}
              >
                All
              </button>
              <button
                role="tab"
                aria-selected={latestChamber === "senate"}
                onClick={() => setLatestChamber("senate")}
                style={latestChamber === "senate" ? segActive : seg}
              >
                Senate
              </button>
              <button
                role="tab"
                aria-selected={latestChamber === "house"}
                onClick={() => setLatestChamber("house")}
                style={latestChamber === "house" ? segActive : seg}
              >
                House
              </button>
            </div>

            {/* Placeholder to keep grid balanced */}
            <div />
          </>
        )}

        {/* Date range (applies to both views) */}
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
      </div>

      {/* Error */}
      {error && (
        <div role="alert" style={errBox}>
          <strong>Couldn’t load results.</strong>
          <div style={{ marginTop: 6 }}>{error}</div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
            Try adjusting filters or dates.
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <div style={muted}>Loading…</div>}

      {/* Empty */}
      {!loading && !error && data && data.length === 0 && (
        <div style={emptyBox}>
          <div>No results found.</div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
            Try different dates or (in Search) switch Ticker/Name or Senate/House.
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
                <Th>Member</Th>
                <Th>Ticker</Th>
                <Th>Asset</Th>
                <Th>Type</Th>
                <Th>Owner</Th>
                <Th>Amount</Th>
                <Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i} style={i % 2 ? trAlt : undefined}>
                  <Td>{fmtDate(r.transactionDate)}</Td>
                  <Td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span>{fmt(r.memberName)}</span>
                      <span style={subtle}>
                        {fmt(r.party)} {r.state ? `• ${r.state}` : ""}
                      </span>
                    </div>
                  </Td>
                  <Td><code style={pill}>{fmt(r.ticker)}</code></Td>
                  <Td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span>{fmt(r.assetName)}</span>
                      <span style={subtle}>{fmt(r.assetType)}</span>
                    </div>
                  </Td>
                  <Td>{fmt(r.transactionType)}</Td>
                  <Td>{fmt(r.owner)}</Td>
                  <Td>{fmt(r.amount)}</Td>
                  <Td>
                    {r.sourceUrl ? (
                      <a href={r.sourceUrl} target="_blank" rel="noreferrer" style={link}>View</a>
                    ) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* mini components */
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

const segWrap: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid var(--line)",
  borderRadius: 10,
  overflow: "hidden",
  height: 38,
  margin: "10px 0",
};

const seg: React.CSSProperties = {
  padding: "0 14px",
  background: "#fff",
  border: "none",
  cursor: "pointer",
  fontWeight: 500,
};

const segActive: React.CSSProperties = {
  ...seg,
  background: "#111827",
  color: "#fff",
};

const toolbar: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto",
  gap: 12,
  alignItems: "center",
  margin: "12px 0 14px",
};

const search: React.CSSProperties = {
  height: 38,
  borderRadius: 10,
  border: "1px solid var(--line)",
  padding: "0 12px",
  fontSize: 14,
  width: "100%",
  outline: "none",
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
const link: React.CSSProperties = { textDecoration: "underline" };
const pill: React.CSSProperties = { display: "inline-block", background: "var(--bgAlt)", border: "1px solid var(--line)", borderRadius: 6, padding: "2px 6px", fontSize: 12 };
const subtle: React.CSSProperties = { fontSize: 12, color: "var(--muted)" as any, marginTop: 2 };