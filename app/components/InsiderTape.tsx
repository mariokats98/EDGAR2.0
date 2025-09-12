// app/components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

export type TxnFilter = "ALL" | "A" | "D";

export type InsiderTapeProps = {
  symbol: string;      // already uppercased by parent is fine
  start: string;       // "YYYY-MM-DD"
  end: string;         // "YYYY-MM-DD"
  txnType: TxnFilter;  // "ALL" | "A" | "D"
  queryKey?: string;   // optional: to bust cache externally
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
  txnType?: "A" | "D";
  transactionCode?: string;
  transactionText?: string;
  shares?: number;
  price?: number;
  value?: number;
  ownedAfter?: number;
  security?: string;
  formUrl?: string;
  indexUrl?: string;
};

function pillColor(type?: "A" | "D") {
  return type === "A"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : type === "D"
    ? "bg-rose-50 text-rose-700 ring-rose-200"
    : "bg-gray-50 text-gray-700 ring-gray-200";
}

export default function InsiderTape({
  symbol,
  start,
  end,
  txnType,
  queryKey,
}: InsiderTapeProps) {
  // Local UI helpers
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(25);
  const [q, setQ] = useState<string>(""); // quick client-side filter

  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset pagination whenever filters change
  useEffect(() => {
    setPage(1);
  }, [symbol, start, end, txnType]);

  async function fetchTape() {
    if (!symbol) {
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
      // optional cache-buster
      if (queryKey) params.set("_", queryKey);
      const url = `/api/insider?${params.toString()}`;
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || "Fetch failed");
      setRows(Array.isArray(j.rows) ? j.rows : []);
      setMeta(j.meta || null);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTape();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, start, end, txnType, page, perPage, queryKey]);

  // client-side quick text filter (insider/issuer/symbol)
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => {
      const hay = `${r.insider} ${r.insiderTitle ?? ""} ${r.issuer} ${r.symbol ?? ""}`.toLowerCase();
      return hay.includes(t);
    });
  }, [rows, q]);

  return (
    <section className="rounded-2xl border bg-white p-4 md:p-5">
      {/* Top line: summary + mini search + per-page + refresh */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="text-xs text-gray-600">
          Source: <span className="font-medium">{meta?.source?.toUpperCase() || "—"}</span>{" "}
          • {filtered.length} trade{filtered.length === 1 ? "" : "s"} shown
          {meta?.count !== undefined ? ` (fetched: ${meta.count})` : ""}
        </div>
        <div className="ml-auto flex items-end gap-2">
          <div>
            <div className="mb-1 text-xs text-gray-700">Quick filter</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter insider/issuer/symbol"
              className="w-48 rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-700">Per page</div>
            <select
              value={perPage}
              onChange={(e) => setPerPage(parseInt(e.target.value))}
              className="w-28 rounded-md border px-3 py-2 text-sm"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <button
            onClick={fetchTape}
            disabled={loading}
            className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Tiny legend for users (A/D vs Code) */}
      <p className="mt-2 text-xs text-gray-500">
        <span className="font-medium">A/D</span>: A = Acquired (e.g., P/Awards), D = Disposed (e.g., S).
        &nbsp;“Code” shows the raw Form 4 code (P, S, A, D, M, G, F…). Ambiguous codes may leave A/D blank.
      </p>

      {/* Error state */}
      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-right">Shares</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">Owned After</th>
              <th className="px-3 py-2 text-left">Link</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const adClass = pillColor(r.txnType);
              const value =
                r.value ??
                (typeof r.shares === "number" && typeof r.price === "number"
                  ? r.shares * r.price
                  : undefined);
              const showPrice =
                typeof r.price === "number" && r.price > 0
                  ? `$${r.price.toFixed(2)}`
                  : r.security && /RSU|AWARD|OPTION|DERIVATIVE/i.test(r.security)
                  ? "—"
                  : "—";

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
                    <div className="text-gray-500 text-xs">
                      {r.symbol ?? r.cik ?? "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${adClass}`}>
                      {r.txnType ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.transactionCode ? (
                      <span
                        title={r.transactionText || ""}
                        className="text-xs font-mono text-gray-700"
                      >
                        {r.transactionCode}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {typeof r.shares === "number" ? r.shares.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{showPrice}</td>
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

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
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