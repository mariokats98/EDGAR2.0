// app/api/insider/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_API_KEY = process.env.FMP_API_KEY || "";

type InsiderRow = {
  source: "fmp" | "sec";
  table?: "I" | "II";
  security?: string;
  insider: string;
  insiderTitle?: string;
  issuer: string;
  symbol?: string;
  cik?: string;
  filedAt?: string;
  transDate?: string;
  txnType?: "A" | "D" | "—";
  shares?: number;
  price?: number;
  value?: number;
  ownedAfter?: number;
  formUrl?: string;
  indexUrl?: string;
};

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
function buildSecUrls(cik?: string, accNoRaw?: string) {
  const pad = padCIK(cik);
  const accNo = accNoRaw?.replace(/-/g, "");
  if (!pad || !accNo) return {};
  const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(pad, 10)}/${accNo}`;
  return {
    indexUrl: `${base}/index.json`,
    formUrl: `${base}/index.html`,
  };
}

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

  let filtered = arr as any[];
  if (txnType !== "ALL") {
    filtered = filtered.filter((t) => {
      const acqDisp =
        t.acquisitionOrDisposition ||
        t.transactionType ||
        t.type ||
        t.ad ||
        t.transactionCode ||
        "";
      const code = (acqDisp || "").toString().toUpperCase();
      if (txnType === "A") return code.startsWith("A") || /PURCHASE|ACQ/.test(code);
      if (txnType === "D") return code.startsWith("D") || /SALE|DISP/.test(code);
      return true;
    });
  }

  const rows: InsiderRow[] = filtered.map((t) => {
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

    const acqDisp =
      t.acquisitionOrDisposition ||
      t.transactionType ||
      t.type ||
      t.ad ||
      t.transactionCode ||
      "";
    let txnTypeNorm: "A" | "D" | "—" = "—";
    const code = (acqDisp || "").toString().toUpperCase();
    if (code.startsWith("A") || /PURCHASE|ACQ/.test(code)) txnTypeNorm = "A";
    else if (code.startsWith("D") || /SALE|DISP/.test(code)) txnTypeNorm = "D";

    const val = shares && price ? shares * price : undefined;

    // Try to surface security + table if FMP returns them (varies by plan/endpoints).
    const security = cleanStr(t.securityTitle || t.security || t.derivativeSecurityTitle);
    let table: "I" | "II" | undefined = undefined;
    const tbl = cleanStr(t.table) || cleanStr(t.tableType) || cleanStr(t.formTable);
    if (tbl && /ii\b|table *ii/i.test(tbl)) table = "II";
    else if (tbl) table = "I";

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
      formUrl: cleanStr(t.link) || formUrl,
      indexUrl,
      security,
      table,
    };
  });

  return {
    rows,
    meta: { source: "fmp", count: rows.length, page, perPage },
  };
}

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

    const fmp = await fetchFromFMP({ symbol, start, end, txnType, page, perPage });
    if (fmp.rows.length > 0) return json({ ok: true, rows: fmp.rows, meta: fmp.meta });

    const sec = await fetchFromSEC({ symbol });
    return json({ ok: true, rows: sec.rows, meta: sec.meta });
  } catch (e: any) {
    return err(e?.message || "Unexpected error", 500);
  }
}