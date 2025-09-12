// app/components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type InsiderRow = {
  id: string;
  symbol: string;
  issuer: string;
  insider: string;
  ad: "A" | "D" | "?";
  transactionDate: string;
  filingDate: string;
  shares: number | null;
  price: number | null;
  value: number | null;
  ownedAfter: number | null;
  formType: string;
  documentUrl?: string;
};

export type InsiderTapeProps = {
  symbol: string;
  start: string;
  end: string;
  txnType: "ALL" | "A" | "D";
  /** change key to force refetch from parent */
  queryKey?: string;
};

function fmtNum(n: number | null | undefined, opts: Intl.NumberFormatOptions = {}) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, ...opts }).format(n);
}

function Pill({ kind }: { kind: "A" | "D" | "?" }) {
  const map = {
    A: "bg-emerald-50 text-emerald-700 border-emerald-200",
    D: "bg-rose-50 text-rose-700 border-rose-200",
    "?": "bg-gray-50 text-gray-700 border-gray-200",
  } as const;
  const label = kind === "A" ? "Acquired (A)" : kind === "D" ? "Disposed (D)" : "Other";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${map[kind]}`}>
      {label}
    </span>
  );
}

export default function InsiderTape({ symbol, start, end, txnType, queryKey }: InsiderTapeProps) {
  const [rows, setRows] = useState<InsiderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (symbol) p.set("symbol", symbol.toUpperCase());
    if (start) p.set("start", start);
    if (end) p.set("end", end);
    if (txnType) p.set("txnType", txnType);
    p.set("limit", "50");
    return `/api/insider?${p.toString()}`;
  }, [symbol, start, end, txnType, queryKey]);

  useEffect(() => {
    let stop = false;
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || j?.ok === false) {
          throw new Error(j?.error || `Fetch failed (${r.status})`);
        }
        if (!stop) setRows(j.data as InsiderRow[]);
      } catch (e: any) {
        if (!stop) setErr(e?.message || "Unexpected error");
      } finally {
        if (!stop) setLoading(false);
      }
    }
    run();
    return () => {
      stop = true;
    };
  }, [url]);

  return (
    <div className="grid gap-3">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-gray-600">
          {loading ? "Loading…" : `${rows.length} transaction${rows.length === 1 ? "" : "s"} loaded`}
          {symbol ? ` • ${symbol}` : ""}
          {txnType !== "ALL" ? ` • ${txnType === "A" ? "Acquisitions" : "Dispositions"}` : ""}
        </div>
        <div className="text-xs text-gray-500">Range: {start} → {end}</div>
      </div>

      {/* error */}
      {err && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {err}
        </div>
      )}

      {/* empty */}
      {!loading && !err && rows.length === 0 && (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-600">
          No insider transactions found for the selected filters.
        </div>
      )}

      {/* list */}
      {rows.map((r) => (
        <article key={r.id} className="rounded-xl border bg-white p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Pill kind={r.ad} />
                <div className="text-sm text-gray-600 truncate">{r.insider}</div>
              </div>
              <div className="mt-0.5 font-medium truncate">
                {r.issuer} <span className="text-gray-400">•</span> {r.symbol || "—"}
              </div>
              <div className="text-xs text-gray-500">
                Txn: {r.transactionDate} <span className="text-gray-300">•</span> Filed: {r.filingDate}
                {r.formType ? <span> <span className="text-gray-300">•</span> Form {r.formType}</span> : null}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-right text-sm">
              <div>
                <div className="text-gray-500">Shares (A/D)</div>
                <div className="font-medium">
                  {fmtNum(r.shares)} <span className="text-gray-400">({r.ad})</span>
                </div>
              </div>
              <div>
                <div className="text-gray-500">Price</div>
                <div className="font-medium">${fmtNum(r.price)}</div>
              </div>
              <div>
                <div className="text-gray-500">Value</div>
                <div className="font-medium">${fmtNum(r.value)}</div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-gray-500">Beneficially Owned (after)</div>
              <div className="font-medium">{fmtNum(r.ownedAfter)}</div>
              {r.documentUrl && (
                <a
                  href={r.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center rounded-full bg-black text-white px-3 py-1.5 text-xs hover:opacity-90"
                >
                  Open Form 4
                </a>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}