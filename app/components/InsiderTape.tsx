"use client";

import { useEffect, useMemo, useState } from "react";

export type TxnFilter = "ALL" | "A" | "D";

export interface InsiderTapeProps {
  symbol?: string;
  start?: string;
  end?: string;
  txnType?: TxnFilter;
  queryKey?: string;
}

type Row = {
  source: "fmp" | "sec";
  insider: string;
  insiderTitle?: string;
  issuer: string;
  symbol?: string;
  cik?: string;
  filedAt?: string;
  transDate?: string;
  txnType?: "A" | "D";
  shares?: number;
  price?: number;
  value?: number;
  ownedAfter?: number;
  formUrl?: string;
  indexUrl?: string;
};

export default function InsiderTape(props: InsiderTapeProps) {
  // state comes only from props (no UI filters here)
  const [symbol, setSymbol] = useState<string>(props.symbol ?? "NVDA");
  const [start, setStart] = useState<string>(
    props.start ??
      (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().slice(0, 10);
      })()
  );
  const [end, setEnd] = useState<string>(
    props.end ?? new Date().toISOString().slice(0, 10)
  );
  const [txnType, setTxnType] = useState<TxnFilter>(props.txnType ?? "ALL");

  // pagination
  const [page, setPage] = useState<number>(1);
  const [perPage] = useState<number>(25);

  // data state
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);

  useEffect(() => {
    if (props.symbol) setSymbol(props.symbol);
    if (props.start) setStart(props.start);
    if (props.end) setEnd(props.end);
    if (props.txnType) setTxnType(props.txnType);
    setPage(1);
  }, [props.symbol, props.start, props.end, props.txnType, props.queryKey]);

  async function fetchTape() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        symbol: symbol.trim(),
        start,
        end,
        txnType,
        page: String(page),
        perPage: String(perPage),
      });
      const url = `/api/insider?${params.toString()}`;
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || "Fetch failed");
      setRows(Array.isArray(j.rows) ? j.rows : []);
      setMeta(j.meta || null);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTape();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, start, end, txnType, page, perPage]);

  function pillColor(type?: "A" | "D") {
    return type === "A"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : type === "D"
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : "bg-gray-50 text-gray-700 ring-gray-200";
  }

  return (
    <section className="rounded-2xl border bg-white p-4 md:p-5">
      {/* Summary */}
      <div className="text-xs text-gray-600">
        Source: <span className="font-medium">{meta?.source?.toUpperCase() || "—"}</span>{" "}
        • {rows.length} trade{rows.length === 1 ? "" : "s"} shown
        {meta?.count !== undefined ? ` (fetched: ${meta.count})` : ""}
        {error ? <span className="text-rose-600 ml-2">• {error}</span> : null}
      </div>

      {/* Table */}
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-gray-700">
              <th className="px-3 py-2 text-left">Date (File / Txn)</th>
              <th className="px-3 py-2 text-left">Insider</th>
              <th className="px-3 py-2 text-left">Issuer / Symbol</th>
              <th className="px-3 py-2 text-left">A/D</th>
              <th className="px-3 py-2 text-right">Shares</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">Owned After</th>
              <th className="px-3 py-2 text-left">Link</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const value =
                r.value ??
                (typeof r.shares === "number" && typeof r.price === "number"
                  ? r.shares * r.price
                  : undefined);
              const adClass = pillColor(r.txnType);
              return (
                <tr key={`${r.symbol}-${r.filedAt}-${i}`} className="border-b">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-gray-900">{r.filedAt ?? "—"}</div>
                    <div className="text-gray-500 text-xs">{r.transDate ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-gray-900">{r.insider}</div>
                    {r.insiderTitle && (
                      <div className="text-gray-500 text-xs">{r.insiderTitle}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-gray-900">{r.issuer}</div>
                    <div className="text-gray-500 text-xs">{r.symbol ?? r.cik ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${adClass}`}
                    >
                      {r.txnType ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {typeof r.shares === "number" ? r.shares.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {typeof r.price === "number" ? `$${r.price.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {typeof value === "number" ? `$${value.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {typeof r.ownedAfter === "number"
                      ? r.ownedAfter.toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.formUrl ? (
                      <a
                        href={r.formUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Open
                      </a>
                    ) : r.indexUrl ? (
                      <a
                        href={r.indexUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Index
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                  No trades found for these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="rounded-md border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          ← Prev
        </button>
        <div className="text-sm">Page {page}</div>
        <button
          className="rounded-md border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={loading || rows.length < perPage}
          onClick={() => setPage((p) => p + 1)}
        >
          Next →
        </button>
      </div>
    </section>
  );
}