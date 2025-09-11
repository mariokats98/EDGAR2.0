// components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type InsiderRow = {
  insider: string;          // e.g., "SMITH JOHN A"
  issuer: string;           // e.g., "NVIDIA CORP"
  symbol?: string;          // e.g., "NVDA"
  filedAt: string;          // e.g., "2025-08-08"
  txnType: "A" | "D" | string; // 'A' (acquired) or 'D' (disposed) per Form 4
  qty?: number | null;      // securities acquired/disposed in this line
  price?: number | null;    // per-share price for this line
  ownedAfter?: number | null; // Beneficially Owned Shares after the txn
  link?: string;            // direct Form 4 document/link
  // optional extras you might have
  title?: string;           // insider title
  relationship?: string;    // officer/director/10% etc.
};

type Props = {
  symbol?: string;
  cik?: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  txnType?: "ALL" | "A" | "D";
  /** a key that can be bumped to force re-fetch */
  queryKey?: number;
};

function n(v?: number | null) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return v;
}

function fmtNum(v?: number | null) {
  const x = n(v);
  if (x === null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(x);
}

function fmtValue(q?: number | null, p?: number | null) {
  const qty = n(q);
  const price = n(p);
  if (qty === null || price === null) return "—";
  const val = qty * price;
  return "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(val);
}

function pillColor(txn: string) {
  if (txn === "A") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (txn === "D") return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  return "bg-gray-100 text-gray-700";
}

export default function InsiderTape({ symbol, cik, start, end, txnType = "ALL", queryKey = 0 }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<InsiderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const qs = useMemo(() => {
    const u = new URLSearchParams();
    if (symbol && symbol.trim()) u.set("symbol", symbol.trim());
    if (cik && cik.trim()) u.set("cik", cik.trim());
    if (start) u.set("start", start);
    if (end) u.set("end", end);
    if (txnType && txnType !== "ALL") u.set("txnType", txnType);
    return u.toString();
  }, [symbol, cik, start, end, txnType]);

  useEffect(() => {
    let cancelled = false;
    async function go() {
      setLoading(true);
      setError(null);
      try {
        // Adjust this path if your insider route is named differently
        const url = `/api/insider?${qs}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(`Fetch failed (${r.status}) ${t || ""}`.trim());
        }
        const j = await r.json();
        let data: InsiderRow[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];

        // Defensive normalization
        data = data.map((d) => ({
          insider: d.insider ?? d.reportingOwner ?? "—",
          issuer: d.issuer ?? d.issuerName ?? "—",
          symbol: d.symbol ?? d.ticker ?? undefined,
          filedAt: d.filedAt ?? d.date ?? "—",
          txnType: (d.txnType ?? d.transactionCode ?? "").toUpperCase(),
          qty: d.qty ?? d.amount ?? d.shares ?? null,
          price: d.price ?? d.transactionPrice ?? null,
          ownedAfter: d.ownedAfter ?? d.beneficiallyOwnedAfter ?? null,
          link: d.link ?? d.documentUrl ?? d.form4Url ?? undefined,
          title: d.title,
          relationship: d.relationship,
        }));

        if (!cancelled) setRows(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load insider data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    go();
    return () => {
      cancelled = true;
    };
  }, [qs, queryKey]);

  return (
    <section className="rounded-2xl border bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {loading ? "Loading insider activity…" : `${rows.length} trade${rows.length === 1 ? "" : "s"} found`}
        </div>
        {error && <div className="text-sm text-rose-600">Error: {error}</div>}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Insider</th>
              <th className="px-3 py-2 font-medium">Issuer</th>
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 font-medium">Txn</th>
              <th className="px-3 py-2 font-medium">Qty (A/D)</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Owned After</th>
              <th className="px-3 py-2 font-medium">Filing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const valueStr = fmtValue(r.qty ?? null, r.price ?? null);
              const txn = (r.txnType || "").toUpperCase();
              return (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{r.filedAt || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{r.insider || "—"}</div>
                    {r.title || r.relationship ? (
                      <div className="text-xs text-gray-500">{r.title || r.relationship}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{r.issuer || "—"}</td>
                  <td className="px-3 py-2 font-mono">{r.symbol || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${pillColor(txn)}`}>
                      {txn === "A" ? "Buy (A)" : txn === "D" ? "Sell (D)" : txn || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{fmtNum(r.qty)}</td>
                  <td className="px-3 py-2 text-right">{r.price != null ? "$" + fmtNum(r.price) : "—"}</td>
                  <td className="px-3 py-2 text-right">{valueStr}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(r.ownedAfter)}</td>
                  <td className="px-3 py-2">
                    {r.link ? (
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Form 4 →
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!loading && !error && rows.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-500">No insider trades found for your filters.</div>
        )}
      </div>
    </section>
  );
}