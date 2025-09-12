// app/components/InsiderTape.tsx
"use client";

import React from "react";

export type TxnType = "ALL" | "A" | "D";

export interface InsiderRow {
  id?: string | number;
  insider?: string;
  issuer?: string;
  symbol?: string;
  transactionCode?: string; // e.g. "P", "S", etc.
  txnCode?: string;
  filedAt?: string;         // ISO or display date
  date?: string;
  link?: string;            // URL to filing (optional)
}

export interface InsiderTapeProps {
  symbol?: string;      // optional: filter to a ticker
  start: string;        // YYYY-MM-DD
  end: string;          // YYYY-MM-DD
  txnType: TxnType;     // "ALL" | "A" | "D"
  /** change this to force refetch */
  queryKey?: string;
}

const API_URL = "/api/insider";

/** Renders insider transactions list */
const InsiderTape: React.FC<InsiderTapeProps> = ({
  symbol = "",
  start,
  end,
  txnType,
  queryKey,
}) => {
  const [rows, setRows] = React.useState<InsiderRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const qs = React.useMemo(() => {
    const p = new URLSearchParams({ start, end });
    if (symbol.trim()) p.set("symbol", symbol.trim().toUpperCase());
    if (txnType && txnType !== "ALL") p.set("txnType", txnType);
    return p.toString();
  }, [symbol, start, end, txnType]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}?${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        const data: InsiderRow[] = Array.isArray(j?.data) ? j.data : [];
        if (!cancelled) setRows(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Fetch failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qs, queryKey]);

  return (
    <div className="mt-4">
      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {error && (
        <div className="text-sm text-red-600">Error: {String(error)}</div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div className="text-sm text-gray-600">No trades found.</div>
      )}

      <ul className="space-y-3">
        {rows.map((r, idx) => {
          const code = r.transactionCode ?? r.txnCode ?? "—";
          const when = r.filedAt ?? r.date ?? "—";
          return (
            <li key={r.id ?? `${r.symbol}-${idx}`} className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-gray-500">
                    {r.issuer ?? "—"} {r.symbol ? `(${r.symbol})` : ""}
                  </div>
                  <div className="font-medium">
                    {r.insider ?? "—"} • {code}
                  </div>
                  <div className="text-xs text-gray-500">{when}</div>
                </div>

                {r.link ? (
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-black text-white px-3 py-1.5 text-sm hover:opacity-90"
                  >
                    Open filing
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">No link</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default InsiderTape;