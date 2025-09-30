// app/components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// ------- Types -------
export type TxnFilter = "ALL" | "P" | "S" | "A" | "D";

type Row = {
  date: string;
  insider: string;
  ticker: string;
  company: string;
  action: "P-PURCHASE" | "S-SALE" | "A-AWARD" | "D-RETURN" | string;
  shares?: number;
  price?: number;
  value?: number;
  link?: string;
};

// ------- Helpers -------
const fmtNum = (n?: number) =>
  typeof n === "number" && isFinite(n) ? n.toLocaleString() : "—";
const fmtUsd = (n?: number) =>
  typeof n === "number" && isFinite(n) ? `$${n.toLocaleString()}` : "—";

function downloadCSV(filename: string, rows: Row[]) {
  const headers = [
    "date",
    "insider",
    "ticker",
    "company",
    "action",
    "shares",
    "price",
    "value",
    "link",
  ];
  const esc = (v: any) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = rows
    .map((r) =>
      [
        r.date,
        r.insider,
        r.ticker,
        r.company,
        r.action,
        r.shares ?? "",
        r.price ?? "",
        r.value ?? "",
        r.link ?? "",
      ]
        .map(esc)
        .join(",")
    )
    .join("\n");
  const csv = headers.join(",") + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ------- Component -------
export default function InsiderTape() {
  // query state
  const [ticker, setTicker] = useState("");
  const [insider, setInsider] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = useState<TxnFilter>("ALL");

  // data state
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // pagination
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const paged = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page]
  );

  // fetcher
  async function fetchRows() {
    setLoading(true);
    setErr(null);
    setPage(1);
    try {
      const q = new URLSearchParams();
      if (ticker.trim()) q.set("ticker", ticker.trim().toUpperCase());
      if (insider.trim()) q.set("insider", insider.trim());
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const res = await fetch(`/api/insider/activity?${q.toString()}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok || j.ok === false) throw new Error(j.error || "Fetch failed");
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // debounced auto-search when fields change (except dates)
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchRows(), 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, insider]);

  // derived filter
  const visible = useMemo(() => {
    if (filter === "ALL") return paged;
    return paged.filter((r) => r.action?.startsWith(filter));
  }, [paged, filter]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(160px,1fr)_minmax(200px,1fr)_auto_auto_auto]">
          <div>
            <div className="mb-1 text-xs text-gray-700">Ticker</div>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="e.g., AAPL"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-gray-700">Insider name</div>
            <input
              value={insider}
              onChange={(e) => setInsider(e.target.value)}
              placeholder="e.g., Tim Cook"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-gray-700">From</div>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-gray-700">To</div>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={fetchRows}
              className="rounded-md bg-black px-4 py-2 text-sm text-white"
            >
              {loading ? "Loading…" : "Search"}
            </button>
            <button
              onClick={() => {
                setTicker("");
                setInsider("");
                const d = new Date();
                d.setMonth(d.getMonth() - 3);
                setFrom(d.toISOString().slice(0, 10));
                setTo(new Date().toISOString().slice(0, 10));
                setFilter("ALL");
                setRows([]);
              }}
              className="rounded-md border px-4 py-2 text-sm"
            >
              Reset
            </button>
            <button
              onClick={() =>
                downloadCSV(
                  `insider_${ticker || "all"}_${from}_${to}.csv`,
                  rows
                )
              }
              disabled={!rows.length}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
              title="Export the current result set"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* quick filters */}
        <div className="mt-3 flex flex-wrap gap-2">
          {(["ALL", "P", "S", "A", "D"] as TxnFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-full border px-3 py-1 text-xs ${
                filter === t
                  ? "bg-black text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
              title={
                t === "P"
                  ? "Purchases"
                  : t === "S"
                  ? "Sales"
                  : t === "A"
                  ? "Awards"
                  : t === "D"
                  ? "Returns"
                  : "All"
              }
            >
              {t === "ALL" ? "All" : t}
            </button>
          ))}
        </div>
      </section>

      {/* Table */}
      <section className="rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-700">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Insider</th>
                <th className="px-3 py-2">Ticker</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2 text-right">Shares</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr
                  key={`${r.date}-${r.ticker}-${i}`}
                  className={i % 2 ? "bg-white" : "bg-gray-50/40"}
                >
                  <td className="px-3 py-2 text-gray-700">{r.date || "—"}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {r.insider || "—"}
                  </td>
                  <td className="px-3 py-2">{r.ticker || "—"}</td>
                  <td className="px-3 py-2">{r.company || "—"}</td>
                  <td className="px-3 py-2">{r.action || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {fmtNum(r.shares as any)}
                  </td>
                  <td className="px-3 py-2 text-right">{fmtUsd(r.price)}</td>
                  <td className="px-3 py-2 text-right">{fmtUsd(r.value)}</td>
                  <td className="px-3 py-2">
                    {r.link ? (
                      <a
                        className="text-blue-600 underline"
                        href={r.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        source
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-sm text-gray-500"
                    colSpan={9}
                  >
                    No trades found for your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {rows.length > pageSize && (
          <div className="flex items-center justify-between border-t px-3 py-2 text-sm">
            <div className="text-gray-600">
              Page {page} / {totalPages} • {rows.length.toLocaleString()} rows
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border px-3 py-1 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-md border px-3 py-1 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {err && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      )}
    </div>
  );
}