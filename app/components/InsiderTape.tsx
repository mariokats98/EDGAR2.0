// components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type InsiderRow = {
  symbol: string;
  companyName?: string;
  insiderName: string;
  insiderTitle?: string;
  tradeDate: string;              // ISO or YYYY-MM-DD
  transactionType: "Buy" | "Sell" | string;
  shares: number;
  price?: number;
  value?: number;                 // shares * price if not given
  cik?: string;
  form?: string;                  // e.g. "4"
  accessionNumber?: string;       // for EDGAR link building
  filingUrl?: string;             // optional if API returns it
};

type ApiResult = {
  ok: boolean;
  total: number;
  page: number;
  perPage: number;
  data: InsiderRow[];
  error?: string;
};

function n(v?: number | null, digits = 0) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function toMoney(v?: number | null) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function edgarDocLink(row: InsiderRow): string | null {
  // Priority: explicit filingUrl from API
  if (row.filingUrl) return row.filingUrl;

  // Fallback: build from CIK + accession if present
  // Example:
  // https://www.sec.gov/Archives/edgar/data/{cik no leading zeros}/{accession w/o dashes}/{primary}.pdf
  // We don’t know primary here; link to index instead:
  if (row.cik && row.accessionNumber) {
    const cikNoLeading = row.cik.replace(/^0+/, "");
    const accNoDashes = row.accessionNumber.replace(/-/g, "");
    return `https://www.sec.gov/Archives/edgar/data/${cikNoLeading}/${accNoDashes}/index.json`;
  }
  return null;
}

export default function InsiderTape({
  defaultSymbol = "",
  limit = 50,
}: {
  defaultSymbol?: string;
  limit?: number;
}) {
  const [symbol, setSymbol] = useState<string>(defaultSymbol);
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(limit);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<InsiderRow[]>([]);
  const [total, setTotal] = useState<number>(0);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / Math.max(1, perPage))),
    [total, perPage]
  );

  async function fetchInsiders() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        perPage: String(perPage),
        page: String(page),
      });
      if (symbol.trim()) params.set("symbol", symbol.trim().toUpperCase());

      // Your backend endpoint (already in your project)
      const url = `/api/insider?${params.toString()}`;

      const r = await fetch(url, { cache: "no-store" });
      const j = (await r.json()) as Partial<ApiResult>;
      if (!r.ok || !j || j.ok === false) {
        throw new Error(j?.error || `Request failed (${r.status})`);
      }

      setRows(j.data || []);
      setTotal(j.total ?? (j.data ? j.data.length : 0));
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  // refetch on inputs change
  useEffect(() => {
    fetchInsiders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, page, perPage]);

  // go to page handler
  function goToPage(raw: string) {
    const p = parseInt(raw, 10);
    if (!Number.isFinite(p)) return;
    setPage(Math.min(Math.max(1, p), totalPages));
  }

  return (
    <section className="rounded-2xl border bg-white p-4 sm:p-5 shadow-sm">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
        <div className="flex-1">
          <label className="text-sm text-gray-700 mb-1 block">
            Filter by Symbol (optional)
          </label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => {
              setPage(1);
              setSymbol(e.target.value);
            }}
            placeholder="e.g., NVDA"
            className="w-full border rounded-md px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm text-gray-700 mb-1 block">Per Page</label>
          <select
            value={perPage}
            onChange={(e) => {
              setPage(1);
              setPerPage(parseInt(e.target.value, 10));
            }}
            className="w-36 border rounded-md px-3 py-2"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>

        <div className="sm:ml-auto">
          <button
            onClick={fetchInsiders}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-black text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Meta / summary */}
      <div className="mt-4 text-sm text-gray-600 flex flex-wrap items-center gap-2">
        <span>
          {loading
            ? "Loading…"
            : `${total.toLocaleString()} trade${
                total === 1 ? "" : "s"
              } found`}
        </span>
        {!!total && (
          <span className="text-gray-400">•</span>
        )}
        {!!total && (
          <span>
            Page {page} of {totalPages}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Rows */}
      <div className="mt-4 grid gap-3">
        {rows.map((r, idx) => {
          const isBuy = String(r.transactionType).toLowerCase().includes("buy");
          const badge =
            isBuy ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                BUY
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                SELL
              </span>
            );

        const link = edgarDocLink(r);
        const value = r.value ?? (r.shares && r.price ? r.shares * r.price : undefined);

          return (
            <article
              key={`${r.symbol}-${r.tradeDate}-${idx}`}
              className="rounded-xl border bg-white p-4 hover:shadow-sm transition"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="font-semibold text-gray-900">{r.symbol}</span>
                    <span className="truncate">{r.companyName || ""}</span>
                  </div>
                  <div className="mt-0.5 text-gray-900 font-medium">
                    {r.insiderName}
                    {r.insiderTitle ? (
                      <span className="text-gray-500 font-normal"> — {r.insiderTitle}</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-gray-500">
                    {r.tradeDate} • {badge}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:text-right">
                  <div className="text-sm">
                    <div className="text-gray-500">Shares</div>
                    <div className="font-medium">{n(r.shares)}</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-gray-500">Price</div>
                    <div className="font-medium">{toMoney(r.price)}</div>
                  </div>
                  <div className="text-sm col-span-2 sm:col-span-1">
                    <div className="text-gray-500">Value</div>
                    <div className={`font-semibold ${isBuy ? "text-emerald-600" : "text-red-600"}`}>
                      {toMoney(value)}
                    </div>
                  </div>

                  <div className="col-span-2 md:col-span-3 md:justify-self-end">
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-black text-white px-3 py-1.5 text-xs hover:opacity-90"
                      >
                        View Filing
                        <svg
                          aria-hidden
                          className="h-3.5 w-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                        >
                          <path strokeWidth="2" strokeLinecap="round" d="M7 17L17 7M9 7h8v8" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">No filing link</span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {!loading && rows.length === 0 && !error && (
          <div className="text-sm text-gray-600">No insider trades found.</div>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-5 flex flex-col sm:flex-row items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-md border bg-white text-sm disabled:opacity-50"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          <button
            className="px-3 py-1.5 rounded-md border bg-white text-sm disabled:opacity-50"
            disabled={loading || page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next →
          </button>
        </div>

        {/* Jump to page */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Go to</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            defaultValue={page}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                goToPage((e.target as HTMLInputElement).value);
              }
            }}
            className="w-20 border rounded-md px-2 py-1"
          />
          <span className="text-gray-500">/ {totalPages}</span>
          <button
            onClick={(e) => {
              const input = (e.currentTarget.previousElementSibling as HTMLSpanElement)
                ?.previousElementSibling as HTMLInputElement | null;
              if (input) goToPage(input.value);
            }}
            className="ml-1 px-3 py-1.5 rounded-md border bg-white hover:bg-gray-50"
          >
            Go
          </button>
        </div>
      </div>
    </section>
  );
}