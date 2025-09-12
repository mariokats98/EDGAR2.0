// app/api/insider/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_API_KEY = process.env.FMP_API_KEY || "";

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
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}
function cleanStr(s?: string | null) {
  return (s ?? "").toString().trim() || undefined;
}
function padCIK(cik?: string | number) {
  if (!cik) return undefined;
  return String(cik).padStart(10, "0");
}

// Try to construct a usable form/index URL if we have CIK + accession.
function buildSecUrls(cik?: string, accNoRaw?: string) {
  const pad = padCIK(cik);
  const accNo = accNoRaw?.replace(/-/g, "");
  if (!pad || !accNo) return {};
  const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(pad, 10)}/${accNo}`;
  return {
    indexUrl: `${base}/index.json`,
    // Often the main doc is index.html or the first file in index.json;
    // we’ll still expose a best-effort classic HTML:
    formUrl: `${base}/index.html`,
  };
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
  url.searchParams.set("apikey", FMP_API_KEY);

  const r = await fetch(url.toString(), {
    headers: { "User-Agent": "Herevna/1.0 (Insider Screener)" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`FMP failed ${r.status}`);
  const arr = await r.json();

  if (!Array.isArray(arr)) return { rows: [], meta: { source: "fmp", count: 0 } };

  // Filter by txnType (A/D) if requested
  let filtered = arr as any[];
  if (txnType !== "ALL") {
    filtered = filtered.filter((t) => {
      // FMP fields vary; normalize a few:
      const acqDisp =
        t.acquisitionOrDisposition ||
        t.transactionType ||
        t.type ||
        t.ad ||
        t.transactionCode ||
        "";
      const code = (acqDisp || "").toString().toUpperCase();
      // accept 'A', 'D', or words that map to A/D
      if (txnType === "A") {
        return code.startsWith("A") || /PURCHASE|ACQ/.test(code);
      }
      if (txnType === "D") {
        return code.startsWith("D") || /SALE|DISP/.test(code);
      }
      return true;
    });
  }

  const rows: InsiderRow[] = filtered.map((t) => {
    // Common FMP fields we’ve seen:
    const cik = t.cik || t.issuerCik || t.cikIssuer;
    const acc = t.accNo || t.accessionNumber || t.accession;
    const { formUrl, indexUrl } = buildSecUrls(cik, acc);

    const shares =
      asNum(t.shares) ??
      asNum(t.securitiesTransacted) ??
      asNum(t.amountOfSecuritiesTransacted);
    const price = asNum(t.price) ?? asNum(t.transactionPrice);
    const ownedAfter =
      asNum(t.sharesOwnedFollowingTransaction) ??
      asNum(t.securitiesOwnedFollowingTransaction);

    // A / D
    const acqDisp =
      t.acquisitionOrDisposition ||
      t.transactionType ||
      t.type ||
      t.ad ||
      t.transactionCode ||
      "";
    let txnTypeNorm: "A" | "D" | undefined;
    const code = (acqDisp || "").toString().toUpperCase();
    if (code.startsWith("A") || /PURCHASE|ACQ/.test(code)) txnTypeNorm = "A";
    else if (code.startsWith("D") || /SALE|DISP/.test(code)) txnTypeNorm = "D";

    const val = shares && price ? shares * price : undefined;

    return {
      source: "fmp",
      insider: cleanStr(t.insiderName) || cleanStr(t.reportingName) || "—",
      insiderTitle: cleanStr(t.insiderTitle) || cleanStr(t.reportingTitle),
      issuer:
        cleanStr(t.companyName) ||
        cleanStr(t.issuerName) ||
        cleanStr(t.issuer) ||
        "—",
      symbol: cleanStr(t.ticker) || cleanStr(t.symbol),
      cik: cik ? padCIK(cik) : undefined,
      filedAt: cleanStr(t.filingDate),
      transDate: cleanStr(t.transactionDate) || cleanStr(t.transactionDate2),
      txnType: txnTypeNorm,
      shares,
      price,
      value: val,
      ownedAfter,
      formUrl: cleanStr(t.link) || formUrl, // FMP sometimes provides link
      indexUrl,
    };
  });

  return {
    rows,
    meta: { source: "fmp", count: rows.length, page, perPage },
  };
}

// ---------- SEC fallback (very light) ----------
async function fetchFromSEC(params: { symbol?: string }) {
  const { symbol } = params;
  if (!symbol) return { rows: [], meta: { source: "sec", note: "no symbol" } };

  // We’ll try the SEC search endpoint to find latest 4 forms for the issuer.
  // This is a minimal fallback and may be sparse compared to FMP.
  const q = encodeURIComponent(`${symbol} form 4`);
  const searchUrl = `https://www.sec.gov/edgar/search/#/category=custom&forms=4&q=${q}`;

  // We cannot scrape client-side here; just return a pointer to the search.
  // (Your EDGAR page already fetches deeply when needed.)
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