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
  txnType?: "A" | "D";            // acquired / disposed (normalized)
  code?: string;                  // raw form-4 code (P, S, M, F, G…)
  shares?: number;                // amount transacted
  price?: number;                 // transaction price
  value?: number;                 // shares * price (if available)
  ownedAfter?: number;            // beneficially owned after txn
  formUrl?: string;               // direct form link (best effort)
  indexUrl?: string;              // index page (best effort)
  security?: string;              // security name/type
  table?: "I" | "II";             // which table the row came from, if known
};

// ---------- small helpers ----------
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

/** Try to construct usable SEC form/index URLs if we have CIK + accession. */
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

/** Map any FMP transaction-ish field to a normalized single-letter Form 4 code if possible. */
function extractCode(t: any): string | undefined {
  // common FMP fields where code may appear
  let raw =
    t?.transactionCode ??
    t?.transactionCodes ??
    t?.code ??
    t?.form4Code ??
    t?.formCode ??
    t?.txCode ??
    "";

  let code = String(raw).trim().toUpperCase();

  // If code is missing, try to infer from description-ish fields
  if (!code) {
    const txt = [
      t?.transactionType,
      t?.type,
      t?.transactionText,
      t?.description,
      t?.securityType,
      t?.securityName,
    ]
      .map((x: any) => (x ?? "").toString().toUpperCase())
      .join(" ");

    // common mappings
    if (/SALE|SOLD|DISP/.test(txt)) code = "S";
    else if (/PURCHASE|BOUGHT|ACQ/.test(txt)) code = "P";
    else if (/OPTION|EXERCIS/.test(txt)) code = "M"; // Form 4 'M' often used for option exercise
    else if (/GIFT/.test(txt)) code = "G";
    else if (/WITHHOLD|TAX/.test(txt)) code = "F";  // tax withholding
  }

  // Keep to a short alphanumeric/letter form if something like "P – Purchase" shows up
  if (code) {
    const short = code.match(/^[A-Z]/);
    if (short) code = short[0];
  }

  return code || undefined;
}

/** Derive A/D from explicit field OR from code. */
function deriveAD(t: any, code?: string): "A" | "D" | undefined {
  const adRaw =
    t?.acquisitionOrDisposition ??
    t?.ad ??
    t?.acqDisp ??
    t?.acqOrDisp ??
    t?.aOrD ??
    "";

  const ad = String(adRaw).trim().toUpperCase();
  if (ad === "A" || ad === "D") return ad as "A" | "D";

  // fall back: infer from code
  const c = (code || "").toUpperCase();
  if (c === "P") return "A"; // purchase -> acquired
  if (c === "S") return "D"; // sale -> disposed
  if (c === "M") return "A"; // option exercise adds underlying
  if (c === "G") return "D"; // gift is a disposition in many reports
  if (c === "F") return "D"; // tax withholding considered disposition

  // as a last resort, scan text-y fields
  const txt = [
    t?.transactionType,
    t?.type,
    t?.transactionText,
    t?.description,
  ]
    .map((x: any) => (x ?? "").toString().toUpperCase())
    .join(" ");

  if (/PURCHASE|ACQ/.test(txt)) return "A";
  if (/SALE|DISP/.test(txt)) return "D";

  return undefined;
}

/** Try to detect Table I or II and the security label if FMP supplies hints. */
function detectTableAndSecurity(t: any): { table?: "I" | "II"; security?: string } {
  const sec =
    cleanStr(t?.securityName) ||
    cleanStr(t?.securityType) ||
    cleanStr(t?.typeOfSecurity) ||
    cleanStr(t?.titleOfSecurity);

  // simple heuristics
  const sU = (sec || "").toUpperCase();
  const looksDerivative =
    /OPTION|DERIVATIVE|RIGHT|WARRANT|RSU|RESTRICTED|PREF/.test(sU) ||
    /TABLE ?II/.test((t?.table || "").toString().toUpperCase());
  const looksNonDerivative =
    /COMMON|ORDINARY|SHARE|STOCK|UNIT/.test(sU) ||
    /TABLE ?I/.test((t?.table || "").toString().toUpperCase());

  let table: "I" | "II" | undefined;
  if (looksDerivative && !looksNonDerivative) table = "II";
  else if (looksNonDerivative && !looksDerivative) table = "I";

  return { table, security: sec };
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

  // Apply txnType filter (A/D) AFTER we normalize per-record
  const rows: InsiderRow[] = arr.map((t: any) => {
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

    const code = extractCode(t);
    const txnTypeNorm = deriveAD(t, code);

    const value = shares && price ? shares * price : undefined;

    const { table, security } = detectTableAndSecurity(t);

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
      code,                 // <— now populated
      txnType: txnTypeNorm, // <— normalized A/D from field or inferred from code/text
      shares,
      price,
      value,
      ownedAfter,
      formUrl: cleanStr(t.link) || formUrl,
      indexUrl,
      security,
      table,
    };
  });

  // final A/D filter
  const filtered =
    txnType === "ALL" ? rows : rows.filter((r) => r.txnType === txnType);

  return {
    rows: filtered,
    meta: { source: "fmp", count: filtered.length, page, perPage },
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

    // FMP first
    const fmp = await fetchFromFMP({ symbol, start, end, txnType, page, perPage });
    if (fmp.rows.length > 0) {
      return json({ ok: true, rows: fmp.rows, meta: fmp.meta });
    }

    // SEC pointer fallback
    const sec = await fetchFromSEC({ symbol });
    return json({ ok: true, rows: sec.rows, meta: sec.meta });
  } catch (e: any) {
    return err(e?.message || "Unexpected error", 500);
  }
}