"use client";

import * as React from "react";

type Chamber = "senate" | "house";
type Mode = "symbol" | "name";

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

const fmt = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString();
};

export default function CongressionalTracker() {
  const [mode, setMode] = React.useState<Mode>("symbol");
  const [chamber, setChamber] = React.useState<Chamber>("senate");
  const [rawQuery, setRawQuery] = React.useState("AAPL");
  const debouncedQuery = useDebounced(rawQuery, 300);

  const [data, setData] = React.useState<Row[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();

    async function run() {
      const q = debouncedQuery.trim();
      if (!q) {
        setData([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/congress", window.location.origin);
        url.searchParams.set("q", q);
        url.searchParams.set("chamber", chamber);
        url.searchParams.set("mode", mode);

        const res = await fetch(url.toString(), {
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
  }, [debouncedQuery, mode, chamber]);

  return (
    <div style={wrap}>
      <header style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Congressional Trades</h2>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" as any }}>
          Search disclosures by <strong>ticker</strong> or <strong>member name</strong>.
        </p>
      </header>

      <div style={toolbar} aria-label="Search and filters">
        {/* Mode toggle */}
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

        {/* Search input */}
        <input
          aria-label={mode === "symbol" ? "Ticker search" : "Member name search"}
          placeholder={mode === "symbol" ? "e.g., AAPL" : "e.g., Nancy Pelosi"}
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setRawQuery((v) => v.trim());
          }}
          style={search}
        />

        {/* Chamber toggle */}
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
      </div>

      {/* Error */}
      {error && (
        <div role="alert" style={errBox}>
          <strong>Couldn’t load results.</strong>
          <div style={{ marginTop: 6 }}>{error}</div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
            Try switching Ticker/Member or Senate/House, or check your spelling.
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <div style={muted}>Loading…</div>}

      {/* Empty */}
      {!loading && !error && data && data.length === 0 && (
        <div style={emptyBox}>
          <div>No results for “{debouncedQuery}”.</div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
            Try switching <em>Ticker/Member</em> or <em>Senate/House</em>.
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
                      <a href={r.sourceUrl} target="_blank" rel="noreferrer" style={link}>
                        View
                      </a>
                    ) : (
                      "—"
                    )}
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

/* Helpers */
function Th({ children }: { children: React.ReactNode }) {
  return <th style={th}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={td}>{children}</td>;
}

/* Styles */
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
  gridTemplateColumns: "auto 1fr auto",
  gap: 12,
  alignItems: "center",
  margin: "12px 0 14px",
};

const segWrap: React.CSSProperties = {
  display: "inline-flex",
  border: "1px solid var(--line)",
  borderRadius: 10,
  overflow: "hidden",
  height: 38,
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

const search: React.CSSProperties = {
  height: 38,
  borderRadius: 10,
  border: "1px solid var(--line)",
  padding: "0 12px",
  fontSize: 14,
  width: "100%",
  outline: "none",
};

const errBox: React.CSSProperties = {
  border: "1px solid #ef4444",
  background: "#fef2f2",
  color: "#991b1b",
  padding: 12,
  borderRadius: 10,
  marginBottom: 12,
};

const muted: React.CSSProperties = {
  padding: "8px 0 14px",
  color: "var(--muted)",
};

const emptyBox: React.CSSProperties = {
  padding: 20,
  border: "1px dashed var(--line)",
  borderRadius: 10,
  textAlign: "center",
  marginTop: 8,
};

const tbl: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 14,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontWeight: 700,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "var(--muted)",
  position: "sticky",
  top: 0,
  background: "#fff",
  borderBottom: "1px solid var(--line)",
};

const td: React.CSSProperties = {
  padding: "12px",
  borderTop: "1px solid var(--line)",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

const trAlt: React.CSSProperties = { background: "var(--bgAlt)" };

const link: React.CSSProperties = {
  textDecoration: "underline",
};

const pill: React.CSSProperties = {
  display: "inline-block",
  background: "var(--bgAlt)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "2px 6px",
  fontSize: 12,
};

const subtle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--muted)",
  marginTop: 2,
};