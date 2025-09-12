// app/api/insider/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_API_KEY = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_KEY || "";

type InsiderRow = {
  source: "fmp" | "sec";
  insider: string;                 // reporting person
  insiderTitle?: string;
  issuer: string;                  // issuer/company name
  symbol?: string;
  cik?: string;
  filedAt?: string;                // filing date
  transDate?: string;              // transaction date
  txnType?: "A" | "D";             // acquired / disposed
  shares?: number;                 // amount transacted
  price?: number;                  // transaction price
  value?: number;                  // shares * price (if available)
  ownedAfter?: number;             // beneficially owned after txn
  formUrl?: string;                // direct form link (best effort)
  indexUrl?: string;               // index page (best effort)
};

// ---------- helpers ----------
function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return json({ error: message }, { status });
}
function asNum(x: any): number | undefined {
  if (x === null || x === undefined || x === "") return undefined;
  const n = Number(String(x).replace(/[, ]+/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
function cleanStr(s?: string | null) {
  return (s ?? "").toString().trim() || undefined;
}
function padCIK(cik?: string | number) {
  if (!cik) return undefined;
  return String(cik).padStart(10, "0");
}
function best<T>(...candidates: T[]): T | undefined {
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== "") return c;
  }
  return undefined;
}

// Try to construct a usable form/index URL if we have CIK + accession.
function buildSecUrls(cik?: string, accNoRaw?: string) {
  const pad = padCIK(cik);
  const accNo = accNoRaw?.replace(/-/g, "");
  if (!pad || !accNo) return {};
  const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(pad, 10)}/${accNo}`;
  return {
    indexUrl: `${base}/index.json`,
    // show an HTML page even if index.json isn’t browsable on some S3 keys
    formUrl: `${base}/index.html`,
  };
}

// Normalize “A”/“D” codes across FMP variants
function normAD(raw: any): "A" | "D" | undefined {
  const code = String(
    best(
      raw.acquisitionOrDisposition,
      raw.acqDispCode,
      raw.transactionCode,
      raw.transactionType,
      raw.type,
      raw.ad
    ) || ""
  ).toUpperCase();

  if (code === "A" || /ACQ|PURCHASE/.test(code)) return "A";
  if (code === "D" || /DISP|SALE/.test(code)) return "D";
  return undefined;
}

// ---------- FMP primary ----------
async function fetchFromFMP(params: {
  symbol?: string;
  start?: string;
  end?: string;
  txnType?: "ALL" | "A" | "D";
  page?: number;
  perPage?: number;
}) {
  if (!FMP_API_KEY) return { rows: [], meta: { source: "fmp", note: "missing FMP key" } };

  const { symbol, start, end, txnType = "ALL", page = 1, perPage = 50 } = params;

  // FMP insider-trading endpoint
  const url = new URL("https://financialmodelingprep.com/api/v4/insider-trading");
  if (symbol) url.searchParams.set("symbol", symbol.toUpperCase());
  if (start) url.searchParams.set("from", start);
  if (end) url.searchParams.set("to", end);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(perPage));
  url.searchParams.set("apikey", FMP_API_KEY); // FMP expects apikey

  const r = await fetch(url.toString(), {
    headers: { "User-Agent": "Herevna/1.0 (Insider Screener)" },
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!r.ok) throw new Error(`FMP failed ${r.status}`);
  const arr = await r.json();

  if (!Array.isArray(arr)) return { rows: [], meta: { source: "fmp", count: 0 } };

  // Filter by txnType (A/D) if requested
  let filtered = arr as any[];
  if (txnType !== "ALL") {
    filtered = filtered.filter((t) => {
      const ad = normAD(t);
      return txnType === "A" ? ad === "A" : ad === "D";
    });
  }

  const rows: InsiderRow[] = filtered.map((t) => {
    // identifiers
    const cik = best(t.cik, t.issuerCik, t.cikIssuer);
    const acc = best(t.accNo, t.accessionNumber, t.accession);

    // shares transacted (Table 4 “Amount”)
    const shares =
      asNum(best(t.transactionShares, t.shares, t.securitiesTransacted, t.amountOfSecuritiesTransacted)) ??
      undefined;

    // transaction price (Table 4 “Price”)
    const price = asNum(best(t.transactionPrice, t.price)) ?? undefined;

    // beneficially owned after (right column on Table 4)
    const ownedAfter =
      asNum(
        best(
          t.sharesOwnedFollowingTransaction,
          t.securitiesOwnedFollowingTransaction,
          t.postTransactionShares,
          t.postShares,
          t.sharesOwnedFollowing
        )
      ) ?? undefined;

    // compute total value
    const value = shares && price ? shares * price : undefined;

    const { formUrl, indexUrl } = (() => {
      // Prefer explicit links when FMP provides
      const direct = cleanStr(best(t.link, t.filingUrl, t.documentUrl, t.finalLink, t.url));
      if (direct) return { formUrl: direct, indexUrl: undefined };
      // Fall back to SEC archive with cik + accession if available
      return buildSecUrls(String(cik || ""), String(acc || ""));
    })();

    return {
      source: "fmp",
      insider: cleanStr(best(t.insiderName, t.reportingName, t.reportingOwnerName, t.ownerName)) || "—",
      insiderTitle: cleanStr(best(t.insiderTitle, t.reportingTitle)),
      issuer: cleanStr(best(t.companyName, t.issuerName, t.issuer, t.reportedIssuerName)) || "—",
      symbol: cleanStr(best(t.ticker, t.symbol, t.issuerTradingSymbol)),
      cik: cik ? padCIK(cik) : undefined,
      filedAt: cleanStr(best(t.filingDate, t.fileDate, t.filedAt, t.date)),
      transDate: cleanStr(best(t.transactionDate, t.tranDate, t.transactionDate2)),
      txnType: normAD(t),
      shares,
      price,
      value,
      ownedAfter,
      formUrl,
      indexUrl,
    };
  });

  return {
    rows,
    meta: { source: "fmp", count: rows.length, page, perPage },
  };
}

// ---------- SEC fallback (pointer only) ----------
async function fetchFromSEC(params: { symbol?: string }) {
  const { symbol } = params;
  if (!symbol) return { rows: [], meta: { source: "sec", note: "no symbol" } };

  const q = encodeURIComponent(`${symbol} form 4`);
  const searchUrl = `https://www.sec.gov/edgar/search/#/category=custom&forms=4&q=${q}`;
  const row: InsiderRow = {
    source: "sec",
    insider: "—",
    issuer: "—",
    symbol,
    formUrl: searchUrl,
    indexUrl: searchUrl,
  };

  return { rows: [row], meta: { source: "sec", note: "search pointer" } };
}

// ---------- Handler ----------
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = cleanStr(searchParams.get("symbol") || "");
    const start = cleanStr(searchParams.get("start") || "");
    const end = cleanStr(searchParams.get("end") || "");
    const txnTypeRaw = (searchParams.get("txnType") || "ALL").toUpperCase();
    const txnType = ["A", "D"].includes(txnTypeRaw) ? (txnTypeRaw as "A" | "D") : "ALL";
    const page = Number(searchParams.get("page") || "1") || 1;
    const perPage = Math.min(200, Number(searchParams.get("perPage") || "50") || 50);

    // 1) FMP first
    const fmp = await fetchFromFMP({ symbol, start, end, txnType, page, perPage });
    if (fmp.rows.length > 0) {
      return json({ ok: true, rows: fmp.rows, meta: fmp.meta });
    }

    // 2) SEC fallback (pointer)
    const sec = await fetchFromSEC({ symbol });
    return json({ ok: true, rows: sec.rows, meta: sec.meta });
  } catch (e: any) {
    return err(e?.message || "Unexpected error", 500);
  }
}