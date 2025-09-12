// app/components/InsiderTape.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

export type TxnFilter = "ALL" | "A" | "D";

export type InsiderTapeProps = {
  symbol: string;        // required by your ClientScreener usage
  start: string;         // YYYY-MM-DD
  end: string;           // YYYY-MM-DD
  txnType: TxnFilter;    // "ALL" | "A" | "D"
  queryKey?: string;     // optional cache-buster
};

type Row = {
  source: "fmp" | "sec";
  insider: string;
  insiderTitle?: string;
  issuer: string;
  symbol?: string;
  cik?: string;
  filedAt?: string;
  transDate?: string;
  txnType?: "A" | "D" | "—";
  shares?: number;
  price?: number;
  value?: number;
  ownedAfter?: number;
  formUrl?: string;
  indexUrl?: string;
};

export default function InsiderTape({
  symbol,
  start,
  end,
  txnType,
  queryKey,
}: InsiderTapeProps): JSX.Element {
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(50);

  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [q, setQ] = useState<string>(""); // client-side text filter

  // refetch when inputs change
  useEffect(() => {
    setPage(1);
  }, [symbol, start, end, txnType, queryKey]);

  async function fetchTape() {
    if (!symbol.trim()) {
      setRows([]);
      setMeta(null);
      return;
    }
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
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTape();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, start, end, txnType, page, perPage, queryKey]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => {
      const hay = `${r.insider} ${r.insiderTitle ?? ""} ${r.issuer} ${r.symbol ?? ""}`.toLowerCase();
      return hay.includes(t);
    });
  }, [rows, q]);

  function pillColor(type?: "A" | "D" | "—") {
    return type === "A"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : type === "D"
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : "bg-gray-50 text-gray-700 ring-gray-200";
  }

  return (
    <section className="rounded-2xl border bg-white p-4 md:p-5">
      {/* Top controls (client-side text filter + per-page + refresh) */}
      <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_auto_auto]">
        <div>
          <div className="mb-1 text-xs text-gray-700">Filter (local)</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by insider or issuer…"
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-700">Per page</div>
          <select
            value={perPage}
            onChange={(e) => setPerPage(parseInt(e.target.value))}
            className="w-full rounded-md border px-3 py-2"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={fetchTape}
            disabled={loading || !symbol.trim()}
            className="w-full md:w-auto rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 text-xs text-gray-500">
        <span className="font-medium">Legend:</span>{" "}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> A = Acquired (Buy)
        </span>{" "}
        ·{" "}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500" /> D = Disposed (Sell)
        </span>
      </div>

      {/* Summary */}
      <div className="mt-3 text-xs text-gray-600">
        {symbol.trim() ? (
          <>
            Symbol: <span className="font-medium">{symbol.toUpperCase()}</span> • Source:{" "}
            <span className="font-medium">{meta?.source?.toUpperCase() || "—"}</span> •{" "}
            {filtered.length} trade{filtered.length === 1 ? "" : "s"} shown
            {meta?.count !== undefined ? ` (fetched: ${meta.count})` : ""}
          </>
        ) : (
          "Enter a ticker above to load insider activity."
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="mt-4 overflow-x-auto">
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
            {filtered.map((r, i) => {
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
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${adClass}`}>
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
                    {typeof r.ownedAfter === "number" ? r.ownedAfter.toLocaleString() : "—"}
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

            {!loading && !error && symbol.trim() && filtered.length === 0 && (
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