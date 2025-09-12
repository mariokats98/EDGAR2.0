"use client";

import { useEffect, useMemo, useState } from "react";

// ---- types ----
export type TxnFilter = "ALL" | "A" | "D";

export type InsiderTapeProps = {
  symbol: string;
  start: string;
  end: string;
  txnType: TxnFilter;
  queryKey?: string; // optional cache-buster
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
  transactionCode?: string;   // <-- UI uses this
  transactionText?: string;   // <-- tooltip/description
  shares?: number;
  price?: number;
  value?: number;
  ownedAfter?: number;
  security?: string;
  formUrl?: string;
  indexUrl?: string;

  // tolerant of server returning `code` instead:
  code?: string;
  description?: string;
};

// ---- helpers ----
function pillColor(type?: "A" | "D") {
  return type === "A"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : type === "D"
    ? "bg-rose-50 text-rose-700 ring-rose-200"
    : "bg-gray-50 text-gray-700 ring-gray-200";
}

function deriveADFromCode(code?: string): "A" | "D" | undefined {
  const c = (code || "").toUpperCase();
  if (c === "P" || c === "M") return "A"; // Purchase / Option exercise
  if (c === "S" || c === "G" || c === "F") return "D"; // Sale / Gift / Tax Withhold
  return undefined;
}

// ---- component ----
export default function InsiderTape({
  symbol,
  start,
  end,
  txnType,
  queryKey,
}: InsiderTapeProps) {
  // pagination + quick filter
  const [page, setPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(25);
  const [q, setQ] = useState<string>("");

  // data state
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [symbol, start, end, txnType]);

  // fetcher
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
      if (queryKey) params.set("_", queryKey);

      const res = await fetch(`/api/insider?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Fetch failed");

      const raw: Row[] = Array.isArray(json.rows) ? json.rows : [];

      // 🔧 Normalize fields so UI is always filled:
      const normalized: Row[] = raw.map((r) => {
        const transactionCode = r.transactionCode ?? r.code; // server may send `code`
        const txnTypeNorm = r.txnType ?? deriveADFromCode(transactionCode);
        const transactionText =
          r.transactionText ?? r.description ?? r.security ?? undefined;

        // keep computed value as fallback
        const value =
          typeof r.value === "number"
            ? r.value
            : typeof r.shares === "number" && typeof r.price === "number"
            ? r.shares * r.price
            : undefined;

        return {
          ...r,
          transactionCode,
          txnType: txnTypeNorm,
          transactionText,
          value,
        };
      });

      setRows(normalized);
      setMeta(json.meta || null);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }

  // refetch on deps
  useEffect(() => {
    fetchTape();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, start, end, txnType, page, perPage, queryKey]);

  // client-side quick filter
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => {
      const hay = `${r.insider} ${r.insiderTitle ?? ""} ${r.issuer} ${r.symbol ?? ""}`.toLowerCase();
      return hay.includes(t);
    });
  }, [rows, q]);

  // ---- render ----
  return (
    <section className="rounded-2xl border bg-white p-4 md:p-5">
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
            className="rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60"
            title="Refresh"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        <span className="font-medium">A/D</span>: A = Acquired (e.g., P/Awards), D = Disposed (e.g., S).&nbsp;
        “Code” shows the raw Form 4 code (P, S, A, D, M, G, F…). When code is ambiguous, A/D may be blank.
      </p>

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-gray-700">
              <th className="px-3 py-2 text-left">Date (File / Txn)</th>
              <th className="px-3 py-2 text-left">Insider</th>
              <th className="px-3 py-2 text-left">Issuer / Symbol</th>
              <th class