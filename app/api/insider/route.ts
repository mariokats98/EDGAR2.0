// app/api/insider/route.ts
import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

const FMP_API_KEY = process.env.FMP_API_KEY || "";

type TxnType = "A" | "D";

type InsiderRow = {
  source: "fmp" | "sec";
  table?: "I" | "II";               // NEW: which Form 4 table
  security?: string;                // NEW: security title (e.g., "Common Stock", "Stock Option (right to buy)")
  insider: string;
  insiderTitle?: string;
  issuer: string;
  symbol?: string;
  cik?: string;
  filedAt?: string;
  transDate?: string;
  txnType?: TxnType | "—";
  shares?: number;                  // for derivs: contracts or underlying units
  price?: number;
  value?: number;                   // shares * price if both present
  ownedAfter?: number;
  formUrl?: string;
  indexUrl?: string;
  accession?: string;
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
function buildSecUrls(cik?: string, accNoRaw?: string) {
  const pad = padCIK(cik);
  const accNo = accNoRaw?.replace(/-/g, "");
  if (!pad || !accNo) return {};
  const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(pad, 10)}/${accNo}`;
  return {
    indexUrl: `${base}/index.json`,
    formUrl: `${base}/index.html`,
    base,
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  allowBooleanAttributes: true,
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
});

// safe getter (SEC Form 4 XML has nested nodes with {value})
function pickText(node: any): string | undefined {
  if (node == null) return undefined;
  if (typeof node === "string") return node.trim() || undefined;
  if (typeof node === "number") return String(node);
  if (node?.["#text"]) return String(node["#text"]).trim() || undefined;
  if (node?.value) return String(node.value).trim() || undefined;
  return undefined;
}

function toArray<T = any>(x: any): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function mapAD(codeNode: any): TxnType | "—" {
  const v = (pickText(codeNode) || "").toUpperCase();
  if (v.startsWith("A")) return "A";
  if (v.startsWith("D")) return "D";
  return "—";
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

  let filtered = arr as any[];
  if (txnType !== "ALL") {
    filtered = filtered.filter((t) => {
      const code =
        (t.acquisitionOrDisposition ||
          t.transactionType ||
          t.type ||
          t.transactionCode ||
          t.ad ||
          "") + "";
      const c = code.toUpperCase();
      if (txnType === "A") return c.startsWith("A") || /PURCHASE|ACQ/.test(c);
      if (txnType === "D") return c.startsWith("D") || /SALE|DISP/.test(c);
      return true;
    });
  }

  const rows: InsiderRow[] = filtered.map((t) => {
    const cik = t.cik || t.issuerCik || t.cikIssuer;
    const acc = t.accNo || t.accessionNumber || t.accession;
    const urls = buildSecUrls(cik, acc);

    const shares =
      asNum(t.shares) ??
      asNum(t.securitiesTransacted) ??
      asNum(t.amountOfSecuritiesTransacted);
    const price = asNum(t.price) ?? asNum(t.transactionPrice);
    const ownedAfter =
      asNum(t.sharesOwnedFollowingTransaction) ??
      asNum(t.securitiesOwnedFollowingTransaction);

    const code =
      (t.acquisitionOrDisposition ||
        t.transactionType ||
        t.type ||
        t.transactionCode ||
        t.ad ||
        "") + "";
    const C = code.toUpperCase();
    let txnTypeNorm: TxnType | "—" = "—";
    if (C.startsWith("A") || /PURCHASE|ACQ/.test(C)) txnTypeNorm = "A";
    else if (C.startsWith("D") || /SALE|DISP/.test(C)) txnTypeNorm = "D";

    const value = shares && price ? shares * price : undefined;

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
      transDate: cleanStr(t.transactionDate),
      txnType: txnTypeNorm,
      shares,
      price,
      value,
      ownedAfter,
      formUrl: cleanStr(t.link) || urls.formUrl,
      indexUrl: urls.indexUrl,
      accession: acc,
    };
  });

  return {
    rows,
    meta: { source: "fmp", count: rows.length, page, perPage },
  };
}

// ---------- SEC enrichment: expand Form 4 XML (Table I + II) ----------
async function expandForm4Transactions(row: InsiderRow): Promise<InsiderRow[]> {
  if (!row.indexUrl && row.cik && row.accession) {
    // build index if missing
    const b = buildSecUrls(row.cik, row.accession);
    row.indexUrl = row.indexUrl || b.indexUrl;
  }
  if (!row.indexUrl) return [row];

  // fetch index.json to find XML
  const idxResp = await fetch(row.indexUrl, {
    headers: { "User-Agent": "Herevna/1.0 (Insider Screener)" },
    cache: "no-store",
  });
  if (!idxResp.ok) return [row];

  const idx = await idxResp.json().catch(() => null);
  const files = Array.isArray(idx?.directory?.item) ? idx.directory.item : [];
  const xmlFile = files.find((f: any) =>
    (f.name || "").toLowerCase().endsWith(".xml")
  );
  if (!xmlFile) return [row];

  // fetch XML
  const base = row.indexUrl.replace(/\/index\.json$/, "");
  const xmlUrl = `${base}/${xmlFile.name}`;
  const xmlResp = await fetch(xmlUrl, {
    headers: { "User-Agent": "Herevna/1.0 (Insider Screener)" },
    cache: "no-store",
  });
  if (!xmlResp.ok) return [row];

  const xmlText = await xmlResp.text();
  const doc = parser.parse(xmlText);

  const od = doc?.ownershipDocument || doc;
  const issuer = od?.issuer || {};
  const issuerName = pickText(issuer?.issuerName) || row.issuer || "—";
  const issuerCik = pickText(issuer?.issuerCik) || row.cik;
  const rptOwner = od?.reportingOwner || {};
  const ownerName =
    pickText(rptOwner?.reportingOwnerId?.rptOwnerName) || row.insider || "—";
  const ownerTitle = pickText(rptOwner?.reportingOwnerRelationship?.officerTitle) || row.insiderTitle;

  const filedAt =
    pickText(od?.periodOfReport) || row.filedAt; // periodOfReport ~ filing date
  const transactions: InsiderRow[] = [];

  // ---- Table I: nonDerivativeTable ----
  const ndTrans = toArray(od?.nonDerivativeTable?.nonDerivativeTransaction);
  ndTrans.forEach((t: any) => {
    const securityTitle = pickText(t?.securityTitle);
    const transDate = pickText(t?.transactionDate?.value);
    const ad = mapAD(t?.transactionAmounts?.transactionAcquiredDisposedCode?.value);
    const sh = asNum(pickText(t?.transactionAmounts?.transactionShares?.value));
    const price = asNum(pickText(t?.transactionAmounts?.transactionPricePerShare?.value));
    const ownedAfter = asNum(pickText(t?.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value));
    const value = sh && price ? sh * price : undefined;

    transactions.push({
      source: "sec",
      table: "I",
      security: securityTitle,
      insider: ownerName,
      insiderTitle: ownerTitle,
      issuer: issuerName,
      symbol: row.symbol,
      cik: issuerCik ? padCIK(issuerCik) : row.cik,
      filedAt,
      transDate,
      txnType: ad,
      shares: sh,
      price,
      value,
      ownedAfter,
      formUrl: row.formUrl,
      indexUrl: row.indexUrl,
      accession: row.accession,
    });
  });

  // ---- Table II: derivativeTable ----
  const dTrans = toArray(od?.derivativeTable?.derivativeTransaction);
  dTrans.forEach((t: any) => {
    const securityTitle = pickText(t?.securityTitle);
    const transDate = pickText(t?.transactionDate?.value);
    const ad = mapAD(t?.transactionAmounts?.transactionAcquiredDisposedCode?.value);
    const sh = asNum(pickText(t?.transactionAmounts?.transactionShares?.value));
    const price = asNum(pickText(t?.transactionAmounts?.transactionPricePerShare?.value));
    const ownedAfter = asNum(pickText(t?.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value));
    const value = sh && price ? sh * price : undefined;

    transactions.push({
      source: "sec",
      table: "II",
      security: securityTitle,
      insider: ownerName,
      insiderTitle: ownerTitle,
      issuer: issuerName,
      symbol: row.symbol,
      cik: issuerCik ? padCIK(issuerCik) : row.cik,
      filedAt,
      transDate,
      txnType: ad,
      shares: sh,  // contracts/units
      price,
      value,
      ownedAfter,
      formUrl: row.formUrl,
      indexUrl: row.indexUrl,
      accession: row.accession,
    });
  });

  // If we successfully parsed any, return expanded list; else fallback to original row
  return transactions.length > 0 ? transactions : [row];
}

// ---------- SEC fallback when FMP empty ----------
async function fetchFromSEC(params: { symbol?: string }) {
  const { symbol } = params;
  if (!symbol) return { rows: [], meta: { source: "sec", note: "no symbol" } };
  const q = encodeURIComponent(`${symbol} form 4`);
  const searchUrl = `https://www.sec.gov/edgar/search/#/category=custom&forms=4&q=${q}`;
  return {
    rows: [
      {
        source: "sec",
        insider: "—",
        issuer: "—",
        symbol,
        formUrl: searchUrl,
        indexUrl: searchUrl,
      } as InsiderRow,
    ],
    meta: { source: "sec", note: "search pointer" },
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
    const txnType = (["A", "D"].includes(txnTypeRaw) ? txnTypeRaw : "ALL") as "ALL" | "A" | "D";
    const page = Number(searchParams.get("page") || "1") || 1;
    const perPage = Math.min(200, Number(searchParams.get("perPage") || "50") || 50);

    // 1) FMP first
    const fmp = await fetchFromFMP({ symbol, start, end, txnType, page, perPage });

    // 2) Enrich each FMP filing with SEC XML (expanding Table I & II)
    //    To avoid hammering SEC, only expand up to the first N rows per page.
    const ENRICH_LIMIT = 30; // tune as needed
    const baseRows = fmp.rows.slice(0, ENRICH_LIMIT);
    const passRows = fmp.rows.slice(ENRICH_LIMIT);

    const expandedLists = await Promise.all(
      baseRows.map((row) => expandForm4Transactions(row).catch(() => [row]))
    );
    const expanded = expandedLists.flat();

    const rows = expanded.concat(passRows);
    if (rows.length > 0) {
      return json({ ok: true, rows, meta: { ...fmp.meta, expanded: expanded.length } });
    }

    // 3) SEC fallback (pointer only)
    const sec = await fetchFromSEC({ symbol });
    return json({ ok: true, rows: sec.rows, meta: sec.meta });
  } catch (e: any) {
    return err(e?.message || "Unexpected error", 500);
  }
}