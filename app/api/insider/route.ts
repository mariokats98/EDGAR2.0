// app/api/insider/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_API_KEY = process.env.FMP_API_KEY || "";

/** Normalized row we return to the client */
type InsiderRow = {
  source: "fmp" | "sec";
  insider: string;
  insiderTitle?: string;
  issuer: string;
  symbol?: string;
  cik?: string;
  filedAt?: string;
  transDate?: string;

  /** Derived from transactionCode when possible */
  txnType?: "A" | "D";

  /** Raw SEC transaction code & a short description */
  transactionCode?: string;
  transactionText?: string;

  /** Table I (Non-derivative) or Table II (Derivative) */
  table?: "I" | "II";
  /** Security title (e.g., Common Stock, RSU, Option (Right to Buy)) */
  security?: string;

  /** Amount / economics */
  shares?: number;
  price?: number;
  value?: number;
  ownedAfter?: number;

  /** Links */
  formUrl?: string;
  indexUrl?: string;
};

// ---------- helpers ----------
function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return json({ ok: false, error: message }, { status });
}
function asNum(x: any): number | undefined {
  if (x === null || x === undefined || x === "") return undefined;
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}
function cleanStr(s?: any) {
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

/** Map SEC transaction codes to A/D where it makes sense */
function mapCodeToAD(code?: string): "A" | "D" | undefined {
  if (!code) return undefined;
  const c = code.toUpperCase();
  // Common mappings (SEC Form 4 Transaction Codes)
  // P=Open Market Purchase -> A, S=Sale -> D, A=Grant -> A, D=Disposition -> D,
  // F=Tax Withholding -> D, M=Option Exercise (derivative -> non-derivative) -> A for the acquired common,
  // G=Gift (n/a), X=Conversion (contextual), C=Conversion (contextual)
  if (c === "P" || c === "A" || c === "M") return "A";
  if (c === "S" || c === "D" || c === "F") return "D";
  return undefined; // leave blank for things like G, X, C, etc.
}

/** Short, friendly description for codes */
function codeText(code?: string): string | undefined {
  if (!code) return undefined;
  const c = code.toUpperCase();
  const map: Record<string, string> = {
    P: "Open market purchase",
    S: "Sale",
    A: "Award/Grant",
    D: "Disposition (other)",
    F: "Tax withholding",
    M: "Option exercise",
    G: "Gift",
    X: "Conversion (derivative)",
    C: "Conversion",
  };
  return map[c] || undefined;
}

/** VERY light SEC fallback: just give a search pointer if FMP is empty */
async function fetchFromSEC(symbol?: string) {
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

/** FMP primary fetch + normalization */
async function fetchFromFMP(params: {
  symbol?: string;
  start?: string;
  end?: string;
  txnType?: "ALL" | "A" | "D";
  page?: number;
  perPage?: number;
}) {
  const { symbol, start, end, txnType = "ALL", page = 1, perPage = 50 } = params;

  if (!FMP_API_KEY) {
    return { rows: [], meta: { source: "fmp", note: "missing FMP_API_KEY" } };
  }

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

  // Normalize & map
  let rows: InsiderRow[] = arr.map((t: any) => {
    // try to detect derivative vs non-derivative
    // FMP often gives a "securityName" or "securityTitle" for derivative rows
    const securityTitle =
      cleanStr(t.securityName) ||
      cleanStr(t.securityTitle) ||
      cleanStr(t.security) ||
      undefined;

    // If security mentions option/RSU/warrant/convertible -> Table II
    const isDerivative =
      !!securityTitle &&
      /option|rsu|right to buy|warrant|convertible|unit/i.test(securityTitle);

    const table: "I" | "II" | undefined = isDerivative ? "II" : "I";

    // numbers
    const shares =
      asNum(t.shares) ??
      asNum(t.securitiesTransacted) ??
      asNum(t.amountOfSecuritiesTransacted);

    const price = asNum(t.price) ?? asNum(t.transactionPrice);

    const ownedAfter =
      asNum(t.sharesOwnedFollowingTransaction) ??
      asNum(t.securitiesOwnedFollowingTransaction);

    const val = shares && price ? shares * price : undefined;

    // code and A/D mapping
    const codeRaw =
      cleanStr(t.transactionCode) ||
      cleanStr(t.code) ||
      cleanStr(t.transactionType) ||
      cleanStr(t.acquisitionOrDisposition) ||
      undefined;

    const code = codeRaw ? codeRaw.toUpperCase() : undefined;
    const txnTypeMapped = mapCodeToAD(code);
    const txnText = codeText(code);

    // accession/cik for deep link
    const cik = t.cik || t.issuerCik || t.cikIssuer;
    const acc = t.accNo || t.accessionNumber || t.accession;
    const { formUrl, indexUrl } = buildSecUrls(cik, acc);

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

      transactionCode: code,
      transactionText: txnText,
      txnType: txnTypeMapped,

      table,
      security: securityTitle || (table === "I" ? "Common Stock" : undefined),

      shares,
      price,
      value: val,
      ownedAfter,

      // prefer FMP link if they provide it; else best-effort SEC index/html
      formUrl: cleanStr(t.link) || formUrl,
      indexUrl,
    };
  });

  // Filter by txnType if requested
  if (params.txnType !== "ALL") {
    rows = rows.filter((r) => r.txnType === params.txnType);
  }

  return {
    rows,
    meta: { source: "fmp", count: rows.length, page, perPage },
  };
}

// ---------- Handler ----------
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = cleanStr(searchParams.get("symbol") || "");
    const start = cleanStr(searchParams.get("start") || "");
    const end = cleanStr(searchParams.get("end") || "");
    const txnTypeRaw = (searchParams.get("txnType") || "ALL").toUpperCase();
    const txnType: "ALL" | "A" | "D" = ["A", "D"].includes(txnTypeRaw)
      ? (txnTypeRaw as "A" | "D")
      : "ALL";
    const page = Number(searchParams.get("page") || "1") || 1;
    const perPage = Math.min(200, Number(searchParams.get("perPage") || "50") || 50);

    // 1) FMP primary
    const fmp = await fetchFromFMP({ symbol, start, end, txnType, page, perPage });
    if (fmp.rows.length > 0) return json({ ok: true, rows: fmp.rows, meta: fmp.meta });

    // 2) SEC fallback (pointer)
    const sec = await fetchFromSEC(symbol);
    return json({ ok: true, rows: sec.rows, meta: sec.meta });
  } catch (e: any) {
    return err(e?.message || "Unexpected error", 500);
  }
}