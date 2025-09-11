"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  symbol: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  txnType: "ALL" | "A" | "D";
  queryKey?: string;
};

/** Extremely loose shape for whatever an upstream API returns */
type ApiRowLoose = Record<string, any>;

/** Tight, normalized shape we actually render */
type UiRow = {
  id: string;
  insider: string;
  issuer: string;
  symbol?: string;
  filedAt: string;
  type?: "A" | "D";
  beneficialShares?: number;
  price?: number;
  valueUSD?: number;
  docUrl?: string;
  title?: string;
};

function formatNum(n?: number) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function formatMoney(n?: number) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/**
 * Try hard to normalize rows from a variety of sources:
 *  - SEC 4 filings JSON (nonDerivativeTable, footnotes, reportingOwner, issuer etc.)
 *  - Aggregators (FMP/Finnhub) which may provide flat fields (transactionPrice, transactionShares, etc.)
 */
function normalizeRow(d: ApiRowLoose, idx: number): UiRow {
  // Potential keys across sources:
  const reportingOwner =
    d.reportingOwner?.name ||
    d.reporting_owner?.name ||
    d.ownerName ||
    d.owner ||
    d.insider ||
    d.officerName ||
    d.directorName;

  const issuerName =
    d.issuer?.name ||
    d.issuerName ||
    d.companyName ||
    d.company ||
    d.issuerTradingSymbol ||
    d.symbol ||
    d.ticker;

  const symbol =
    d.symbol ||
    d.ticker ||
    d.issuerTradingSymbol ||
    d.issuer?.ticker;

  // Filing date / disclosure date
  const filedAt =
    d.filedAt ||
    d.filed_at ||
    d.filingDate ||
    d.date ||
    d.transactionDate ||
    d.reportPeriod ||
    d.periodOfReport ||
    d.acceptanceDateTime ||
    d.accepted ||
    d.createdAt ||
    "—";

  // Transaction type A/D
  const type: "A" | "D" | undefined =
    d.type === "A" || d.type === "D"
      ? d.type
      : d.transactionType === "A" || d.transactionType === "D"
      ? d.transactionType
      : d.transactionAcquiredDisposedCode?.code === "A" || d.transactionAcquiredDisposedCode?.value === "A"
      ? "A"
      : d.transactionAcquiredDisposedCode?.code === "D" || d.transactionAcquiredDisposedCode?.value === "D"
      ? "D"
      : undefined;

  // Beneficially owned shares (post-transaction)
  // Common locations: d.sharesOwnedFollowingTransaction, d.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value, etc.
  const beneficialSharesRaw =
    d.sharesOwnedFollowingTransaction ??
    d.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value ??
    d.postTransactionAmounts?.sharesOwnedFollowingTransaction ??
    d.ownedFollowing ?? d.beneficialShares ?? d.shares;

  const beneficialShares =
    typeof beneficialSharesRaw === "string"
      ? Number(beneficialSharesRaw.replace(/[, ]/g, ""))
      : typeof beneficialSharesRaw === "number"
      ? beneficialSharesRaw
      : undefined;

  // Transaction shares & price for the line item (used to compute value)
  const txnSharesRaw =
    d.transactionShares?.value ??
    d.transactionShares ??
    d.sharesTraded ??
    d.transactionAmountShares ??
    d.quantity ??
    d.qty ??
    d.sharesAcquiredDisposed ??
    d.amountOfSecuritiesTransacted;

  const txnShares =
    typeof txnSharesRaw === "string"
      ? Number(txnSharesRaw.replace(/[, ]/g, ""))
      : typeof txnSharesRaw === "number"
      ? txnSharesRaw
      : undefined;

  const txnPriceRaw =
    d.transactionPricePerShare?.value ??
    d.transactionPricePerShare ??
    d.price ??
    d.executionPrice ??
    d.transactionPrice;

  const price =
    typeof txnPriceRaw === "string"
      ? Number(txnPriceRaw.replace(/[$, ]/g, ""))
      : typeof txnPriceRaw === "number"
      ? txnPriceRaw
      : undefined;

  const valueUSD =
    typeof txnShares === "number" && typeof price === "number"
      ? txnShares * price
      : undefined;

  // Doc / filing URL candidates
  const docUrl =
    d.docUrl ||
    d.documentUrl ||
    d.link ||
    d.filingUrl ||
    d.secUrl ||
    d.primaryDocumentUrl ||
    (d.accessionNumber && d.cik
      ? `https://www.sec.gov/Archives/edgar/data/${String(d.cik).replace(/^0+/, "")}/${String(d.accessionNumber).replace(/-/g, "")}/${d.primaryDocument || "index.htm"}`
      : undefined);

  const title =
    d.title ||
    d.securityTitle?.value ||
    d.securityTitle ||
    d.derivativeSecurityTitle?.value ||
    d.derivativeSecurityTitle ||
    undefined;

  return {
    id: d.id || d.accessionNumber || `${symbol || issuerName || "row"}-${idx}`,
    insider: reportingOwner || "—",
    issuer: issuerName || "—",
    symbol: symbol || undefined,
    filedAt: filedAt || "—",
    type,
    beneficialShares,
    price,
    valueUSD,
    docUrl,
    title,
  };
}

export default function InsiderTape({
  symbol,
  start,
  end,
  txnType,
  queryKey,
}: Props) {
  const [rows, setRows] = useState<UiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const key = useMemo(
    () => `${symbol}-${start}-${end}-${txnType}-${queryKey || ""}`,
    [symbol, start, end, txnType, queryKey]
  );

  useEffect(() => {
    let aborted = false;

    async function go() {
      try {
        setLoading(true);
        setErr(null);
        setRows([]);

        // Call your insider API route (which routes to FMP/SEC/etc)
        const params = new URLSearchParams({
          start,
          end,
          symbol: symbol.trim(),
        });
        if (txnType !== "ALL") params.set("type", txnType);

        const res = await fetch(`/api/insider?${params.toString()}`, {
          cache: "no-store",
        });
        const j = (await res.json()) as { ok?: boolean; data?: ApiRowLoose[]; error?: string };

        if (!res.ok || j?.ok === false) {
          throw new Error(j?.error || `Fetch failed (${res.status})`);
        }

        const data = Array.isArray(j?.data) ? j!.data! : [];

        // Normalize every incoming row
        const normalized = data.map((d, i) => normalizeRow(d, i));

        // Final filter by txnType if backend didn't filter
        const filtered =
          txnType === "ALL"
            ? normalized
            : normalized.filter((r) => r.type === txnType);

        if (!aborted) setRows(filtered);
      } catch (e: any) {
        if (!aborted) setErr(e?.message || "Failed to fetch");
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    go();
    return () => {
      aborted = true;
    };
  }, [key]);

  return (
    <section className="rounded-2xl border bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-base font-semibold">
          Insider Transactions {symbol ? `• ${symbol}` : ""}
        </h2>
        <div className="text-xs text-gray-500">
          {loading ? "Loading…" : `${rows.length} result${rows.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {err && (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-b">
          {err}
        </div>
      )}

      <div className="divide-y">
        {/* Header row */}
        <div className="grid grid-cols-[1.5fr_1fr_.8fr_.8fr_.8fr_.8fr_auto] gap-3 px-4 py-2 text-xs font-medium text-gray-500">
          <div>Insider</div>
          <div>Issuer</div>
          <div>Type</div>
          <div>Beneficially Owned Shares</div>
          <div>Price</div>
          <div>Value</div>
          <div>Link</div>
        </div>

        {/* Data rows */}
        {rows.length === 0 && !loading ? (
          <div className="px-4 py-6 text-sm text-gray-600">No trades found.</div>
        ) : (
          rows.map((r) => (
            <article
              key={r.id}
              className="grid grid-cols-[1.5fr_1fr_.8fr_.8fr_.8fr_.8fr_auto] gap-3 px-4 py-3 items-center"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{r.insider}</div>
                {r.title && (
                  <div className="truncate text-xs text-gray-500">{r.title}</div>
                )}
              </div>

              <div className="min-w-0">
                <div className="truncate">{r.issuer}</div>
                <div className="text-xs text-gray-500">
                  {r.symbol || "—"} • {r.filedAt || "—"}
                </div>
              </div>

              <div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                    r.type === "A"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : r.type === "D"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-gray-50 text-gray-700 border-gray-200"
                  }`}
                >
                  {r.type ?? "—"}
                </span>
              </div>

              <div className="tabular-nums">{formatNum(r.beneficialShares)}</div>
              <div className="tabular-nums">{r.price != null ? `$${formatNum(r.price)}` : "—"}</div>
              <div className="tabular-nums">{formatMoney(r.valueUSD)}</div>

              <div className="text-right">
                {r.docUrl ? (
                  <a
                    href={r.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full bg-black text-white px-3 py-1.5 text-xs hover:opacity-90"
                  >
                    Open
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}