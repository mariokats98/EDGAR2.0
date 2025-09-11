import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type InsiderRow = {
  symbol: string;
  insiderName: string;
  tradeDate: string;             // YYYY-MM-DD
  transactionType: "Buy" | "Sell" | "A" | "D" | "Unknown";
  shares: number | null;
  price?: number | null;
  valueUSD?: number | null;
  source: "FMP" | "Finnhub" | "SEC";
  filingUrl?: string;            // direct doc if available, else index
  indexUrl?: string;             // SEC index page (backup)
  cik?: string;
};

function j(data: any, init?: ResponseInit) { return NextResponse.json(data, init); }
function bad(message: string, status = 400) { return j({ ok: false, error: message }, { status }); }
function ok(data: InsiderRow[], fallbackUsed: string[]) {
  return j({ ok: true, count: data.length, fallbacksTried: fallbackUsed, data });
}

// -------- helpers --------
const UA_HEADERS = {
  "User-Agent": "Herevna.io (contact@herevna.io)",
  "Accept-Encoding": "gzip, deflate",
};

function toISO(d?: string | null) {
  if (!d) return "";
  const m = d.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const m2 = d.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return d;
}
function toTxn(letter?: string | null): InsiderRow["transactionType"] {
  if (!letter) return "Unknown";
  const x = letter.toUpperCase();
  if (x === "P" || x === "A") return "Buy";   // Purchase / Acquisition
  if (x === "S" || x === "D") return "Sell";  // Sale / Disposition
  return (x === "A" || x === "D") ? (x as "A" | "D") : "Unknown";
}
function safeNum(n: any): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}
function computeValueUSD(shares: number | null, price: number | null) {
  if (shares === null || price === null) return null;
  return Number((shares * price).toFixed(2));
}

// quick-n-dirty first-transaction XML parse for Form 4
function parseForm4Xml(xml: string): { shares: number | null; price: number | null; code?: string } {
  const getVal = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}>\\s*<value>([^<]+)</value>`, "i"));
    return m ? m[1] : null;
  };
  const shares = safeNum(getVal("transactionShares"));
  const price = safeNum(getVal("transactionPricePerShare"));
  const code = getVal("transactionAcquiredDisposedCode")?.trim() || undefined;
  return { shares, price, code };
}

// -------- 1) FMP --------
async function fetchFromFMP(symbol?: string, limit = 50): Promise<InsiderRow[]> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return [];

  const url = symbol
    ? `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${encodeURIComponent(symbol)}&limit=${limit}&apikey=${apiKey}`
    : `https://financialmodelingprep.com/api/v4/insider-trading?limit=${limit}&apikey=${apiKey}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`FMP fetch failed (${r.status})`);
  const rows: any[] = await r.json();
  if (!Array.isArray(rows)) return [];

  const mapped: InsiderRow[] = rows.map((x) => {
    const shares = safeNum(x.securitiesTransacted ?? x.sharesNumber);
    const price = safeNum(x.price);
    const valueUSD = computeValueUSD(shares, price);

    let txn: InsiderRow["transactionType"] = "Unknown";
    if (x.acquisitionOrDisposition) txn = toTxn(String(x.acquisitionOrDisposition));
    else if (x.transactionType) txn = toTxn(String(x.transactionType));

    return {
      symbol: x.symbol ?? "",
      insiderName: x.reportingName ?? x.ownerCik ?? "Unknown",
      tradeDate: toISO(x.transactionDate ?? x.filingDate),
      transactionType: txn,
      shares,
      price,
      valueUSD,
      source: "FMP",
      filingUrl: x.link || undefined, // FMP sometimes provides a link
      cik: x.cik || x.ownerCik || undefined,
    };
  });

  return mapped.slice(0, limit);
}

// -------- 2) Finnhub (+ SEC enrich for link) --------
async function fetchFromFinnhub(symbol?: string, limit = 50): Promise<InsiderRow[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token || !symbol) return [];

  const url = `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&token=${token}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Finnhub fetch failed (${r.status})`);
  const data: any = await r.json();

  const arr: any[] = Array.isArray(data?.data) ? data.data : [];
  let rows: InsiderRow[] = arr.map((x) => {
    const shares = safeNum(x.share);
    const price = safeNum(x.price);
    const valueUSD = computeValueUSD(shares, price);

    return {
      symbol: x.symbol ?? symbol ?? "",
      insiderName: x.name ?? "Unknown",
      tradeDate: toISO(x.transactionDate ?? x.filingDate ?? x.time),
      transactionType: toTxn(x.transaction), // P / S
      shares,
      price,
      valueUSD,
      source: "Finnhub",
      cik: x.cik || undefined,
    };
  });

  rows = rows.slice(0, limit);

  // Enrich with SEC filing link when we have CIK
  const firstWithCik = rows.find((r) => r.cik);
  if (firstWithCik?.cik) {
    try {
      const padded = firstWithCik.cik.replace(/\D/g, "").padStart(10, "0");
      const secUrl = `https://data.sec.gov/submissions/CIK${padded}.json`;
      const rs = await fetch(secUrl, { headers: UA_HEADERS, cache: "no-store" });
      if (rs.ok) {
        const d: any = await rs.json();
        const forms: string[] = d?.filings?.recent?.form || [];
        const acc: string[] = d?.filings?.recent?.accessionNumber || [];
        const primaryDoc: string[] = d?.filings?.recent?.primaryDocument || [];
        const fdates: string[] = d?.filings?.recent?.filingDate || [];
        const symbolFromSec = (d?.tickers || [])[0] || symbol;

        // Build a small map by date to a filing URL for Form 4
        const byDate: Record<string, string> = {};
        for (let i = 0; i < forms.length; i++) {
          if (forms[i] !== "4") continue;
          const accession = acc[i];
          const prim = primaryDoc[i];
          const date = fdates[i];
          if (!accession || !date) continue;
          const accessionNoDashes = accession.replace(/-/g, "");
          const direct = prim
            ? `https://www.sec.gov/Archives/edgar/data/${Number(padded)}/${accessionNoDashes}/${prim}`
            : `https://www.sec.gov/Archives/edgar/data/${Number(padded)}/${accessionNoDashes}/${accession}-index.htm`;
          byDate[date] = direct;
        }

        // attach nearest same-date filing link
        rows = rows.map((row) => {
          if (!row.filingUrl && row.tradeDate && byDate[row.tradeDate]) {
            return { ...row, filingUrl: byDate[row.tradeDate], symbol: row.symbol || symbolFromSec };
          }
          return row;
        });
      }
    } catch {
      // ignore enrichment failure
    }
  }

  return rows;
}

// -------- 3) SEC (Form 4) with price/shares via XML parse --------
async function fetchFromSEC(cik: string, limit = 50): Promise<InsiderRow[]> {
  if (!cik) return [];
  const padded = cik.replace(/\D/g, "").padStart(10, "0");

  const subUrl = `https://data.sec.gov/submissions/CIK${padded}.json`;
  const r = await fetch(subUrl, { headers: UA_HEADERS, cache: "no-store" });
  if (!r.ok) throw new Error(`SEC fetch failed (${r.status})`);
  const data: any = await r.json();

  const recent = data?.filings?.recent || {};
  const forms: string[] = recent.form || [];
  const acc: string[] = recent.accessionNumber || [];
  const dates: string[] = recent.filingDate || [];
  const primaryDoc: string[] = recent.primaryDocument || [];
  const tickers: string[] = data?.tickers || [];
  const symbol = tickers[0] || "";

  const out: InsiderRow[] = [];

  for (let i = 0; i < forms.length; i++) {
    if (forms[i] !== "4") continue;
    const accession = acc[i];
    if (!accession) continue;

    const accessionNoDashes = accession.replace(/-/g, "");
    const prim = primaryDoc[i];
    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${Number(padded)}/${accessionNoDashes}/${accession}-index.htm`;
    const directDoc = prim
      ? `https://www.sec.gov/Archives/edgar/data/${Number(padded)}/${accessionNoDashes}/${prim}`
      : indexUrl;

    // Try to pull first transaction details from the XML if we have it
    let shares: number | null = null;
    let price: number | null = null;
    let txnLetter: string | undefined;

    try {
      if (directDoc.endsWith(".xml")) {
        const rx = await fetch(directDoc, { headers: UA_HEADERS, cache: "no-store" });
        if (rx.ok) {
          const xml = await rx.text();
          const parsed = parseForm4Xml(xml);
          shares = parsed.shares;
          price = parsed.price;
          txnLetter = parsed.code;
        }
      }
    } catch {
      // ignore XML parse errors
    }

    const valueUSD = computeValueUSD(shares, price);
    const transactionType = txnLetter ? toTxn(txnLetter) : "Unknown";

    out.push({
      symbol,
      insiderName: "See Form 4 (details inside)",
      tradeDate: toISO(dates[i]),
      transactionType,
      shares,
      price,
      valueUSD,
      source: "SEC",
      filingUrl: directDoc,
      indexUrl,
      cik: padded,
    });

    if (out.length >= limit) break;
  }
  return out;
}

// -------- handler --------
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.trim().toUpperCase();
    const cik = searchParams.get("cik")?.trim();
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 200);

    const tried: string[] = [];
    let results: InsiderRow[] = [];

    // 1) FMP
    try {
      tried.push("FMP");
      const r1 = await fetchFromFMP(symbol, limit);
      if (r1.length) return ok(r1, tried);
    } catch {}

    // 2) Finnhub
    try {
      if (symbol) {
        tried.push("Finnhub");
        const r2 = await fetchFromFinnhub(symbol, limit);
        if (r2.length) return ok(r2, tried);
      }
    } catch {}

    // 3) SEC
    try {
      if (cik) {
        tried.push("SEC");
        const r3 = await fetchFromSEC(cik, limit);
        if (r3.length) return ok(r3, tried);
      }
    } catch {}

    return ok([], tried);
  } catch (err: any) {
    return bad(err?.message || "Unexpected error", 500);
  }
}