// app/components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type TxnFilter = "ALL" | "A" | "D";

type Row = {
  source: "fmp" | "sec";
  insider: string;
  insiderTitle?: string;
  issuer: string;
  symbol?: string;
  cik?: string;
  filedAt?: string;
  transDate?: string;
  txnType?: "A" | "D";     // acquired / disposed (normalized)
  code?: string;           // raw Form 4 code (P, S, M…)
  shares?: number;
  price?: number;
  value?: number;
  ownedAfter?: number;
  formUrl?: string;
  indexUrl?: string;
  security?: string;       // e.g., "Common Stock", "Stock Option"
  table?: "I" | "II";
};

function fmtNum(n?: number) {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "—";
}
function fmtUsd(n?: number) {
  return typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : "—";
}
function pill(type?: "A" | "D") {
  if (type === "A") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (type === "D") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-gray-50 text-gray-700 ring-gray-200";
}

export default function InsiderTape() {
  // Filters
  const [symbol, setSymbol] = useState<string>("");
  const [start, setStart] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState<string>(new Date().toISOString().slice(0, 10));
  const [txnType, setTxnType] = useState<TxnFilter>("ALL");
  const [q, setQ] = useState<string>("");

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(25);

  // Data
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [symbol, start, end, txnType]);

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
        symbol: symbol.trim().toUpperCase(),
        start,
        end,
        txnType,
        page: String(page),
        perPage: String(perPage),
      });
      const r = await fetch(`/api/insider?${params.toString()}`, { cache: "no-store" });
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

  // Fetch on filter changes
  useEffect(() => {
    fetchTape();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, start, end, txnType, page, perPage]);

  // Client-side quick filter
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
      {/* Top row: summary + refresh */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="text-xs text-gray-600">
          Source: <span className="font-medium">{meta?.source?.toUpperCase() || "—"}</span> •{" "}
          {filtered.length} trade{filtered.length === 1 ? "" : "s"} shown
          {meta?.count !== undefined ? ` (fetched: ${meta.count})` : ""}
        </div>
        <div className="ml-auto text-[11px] text-gray-500">A = acquired (buy) • D = disposed (sell)</div>
        <button
          onClick={fetchTape}
          disabled={loading}
          className="rounded-md border bg-white px-2.5 py-1 text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-60"
          title="Refresh"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {/* Filters */}
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(160px,1fr)_repeat(2,1fr)_auto_auto_minmax(160px,1fr)]">
        <div>
          <div className="mb-1 text-xs text-gray-700">Symbol</div>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g., AAPL (press Enter)"
            onKeyDown={(e) => { if (e.key === "Enter") fetchTape(); }}
            className="w-full rounded-md border px-3 py-2"
            inputMode="text"
            autoCapitalize="characters"
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-700">Start</div>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-700">End</div>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-700">Type</div>
          <select
            value={txnType}
            onChange={(e) => setTxnType(e.target.value as TxnFilter)}
            className="w-full rounded-md border px-3 py-2"
          >
            <option value="ALL">All</option>
            <option value="A">Acquired (A)</option>
            <option value="D">Disposed (D)</option>
          </select>
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
        <div>
          <div className="mb-1 text-xs text-gray-700">Filter text</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by insider or issuer"
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
      </div>

      {/* Errors */}
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
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">A/D</th>
              <th className="px-3 py-2 text-right">Shares</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">Owned After</th>
              <th className="px-3 py-2 text-left">Security</th>
              <th className="px-3 py-2 text-left">Table</th>
              <th className="px-3 py-2 text-left">Link</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const value =
                typeof r.value === "number"
                  ? r.value
                  : typeof r.shares === "number" && typeof r.price === "number"
                  ? r.shares * r.price
                  : undefined;

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
                    <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-700 ring-1 ring-gray-200">
                      {r.code ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${pill(r.txnType)}`}>
                      {r.txnType ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{fmtNum(r.shares)}</td>
                  <td className="px-3 py-2 text-right">{fmtUsd(r.price)}</td>
                  <td className="px-3 py-2 text-right">{fmtUsd(value)}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(r.ownedAfter)}</td>
                  <td className="px-3 py-2">
                    <div className="text-gray-900">{r.security ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2">{r.table ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.formUrl ? (
                      <a href={r.formUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        Open
                      </a>
                    ) : r.indexUrl ? (
                      <a href={r.indexUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
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
                <td colSpan={12} className="px-3 py-6 text-center text-gray-500">
                  {symbol.trim() ? "No trades found for these filters." : "Enter a symbol to begin."}
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