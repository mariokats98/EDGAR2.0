// app/components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Txn = {
  insider: string;
  issuer: string;
  symbol?: string;
  filedAt: string;
  action: "A" | "D" | "—";
  shares?: number;
  price?: number;
  value?: number;
  ownedFollowing?: number;
  formUrl?: string;
  indexUrl?: string;
  accessionNumber?: string;
};

export type InsiderTapeProps = {
  /** Provide ONE of these three: symbol, cik, or issuer */
  symbol?: string;       // e.g. "NVDA"
  cik?: string;          // 10-digit, e.g. "0001045810"
  issuer?: string;       // fuzzy company match

  /** Optional filters */
  start?: string;        // YYYY-MM-DD
  end?: string;          // YYYY-MM-DD
  txnType?: "ALL" | "A" | "D";

  /** Optional: forces re-run when this changes */
  queryKey?: string;
};

export default function InsiderTape({
  symbol,
  cik,
  issuer,
  start,
  end,
  txnType = "ALL",
  queryKey,
}: InsiderTapeProps) {
  const [rows, setRows] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (symbol) p.set("symbol", symbol.trim());
    if (cik) p.set("cik", cik.trim());
    if (issuer) p.set("issuer", issuer.trim());
    if (start) p.set("start", start);
    if (end) p.set("end", end);
    if (txnType && txnType !== "ALL") p.set("action", txnType);
    p.set("perPage", "50");
    return p.toString();
  }, [symbol, cik, issuer, start, end, txnType]);

  useEffect(() => {
    let abort = false;
    async function run() {
      try {
        setLoading(true);
        setErr(null);
        setRows([]);

        const r = await fetch(`/api/insider?${params}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || j?.error) throw new Error(j?.error || `Request failed (${r.status})`);
        if (abort) return;
        setRows(j?.data || []);
      } catch (e: any) {
        if (!abort) setErr(e?.message || "Failed to load insider tape");
      } finally {
        if (!abort) setLoading(false);
      }
    }
    run();
    return () => {
      abort = true;
    };
    // include queryKey so parent can force refetch
  }, [params, queryKey]);

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">
          Insider Transactions {symbol ? `· ${symbol}` : issuer ? `· ${issuer}` : cik ? `· ${cik}` : ""}
        </h2>
        {loading && <span className="text-xs text-gray-500">Loading…</span>}
      </div>

      {err && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div className="mt-3 text-sm text-gray-600">No trades found for the current filters.</div>
      )}

      <div className="mt-3 divide-y rounded-xl border bg-white">
        {rows.map((r, i) => (
          <article key={`${r.accessionNumber || i}`} className="p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <div className="text-sm text-gray-600">
                  {r.issuer} {r.symbol ? `(${r.symbol})` : ""}
                </div>
                <div className="font-medium">
                  {r.insider} • {r.filedAt} •{" "}
                  <span className={r.action === "A" ? "text-emerald-600" : r.action === "D" ? "text-red-600" : "text-gray-600"}>
                    {r.action === "A" ? "Acquired (A)" : r.action === "D" ? "Disposed (D)" : "—"}
                  </span>
                </div>
                <div className="mt-1 text-sm text-gray-700">
                  {typeof r.shares === "number" && (
                    <>Shares: <span className="font-medium">{Intl.NumberFormat().format(r.shares)}</span>{" "}</>
                  )}
                  {typeof r.price === "number" && (
                    <>@ <span className="font-medium">${r.price.toFixed(2)}</span>{" "}</>
                  )}
                  {typeof r.value === "number" && (
                    <>· Value: <span className="font-medium">${Intl.NumberFormat().format(Math.round(r.value))}</span>{" "}</>
                  )}
                  {typeof r.ownedFollowing === "number" && (
                    <>· Beneficially Owned: <span className="font-medium">{Intl.NumberFormat().format(r.ownedFollowing)}</span></>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {r.formUrl && (
                  <a
                    href={r.formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full bg-black text-white px-3 py-1.5 text-sm hover:opacity-90"
                  >
                    Open / Download
                  </a>
                )}
                {r.indexUrl && (
                  <a
                    href={r.indexUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    View index
                  </a>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}