// app/api/insider/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // allow standard fetch & headers

type InsiderRow = {
  symbol: string;
  insiderName: string;
  tradeDate: string;             // YYYY-MM-DD
  transactionType: "Buy" | "Sell" | "A" | "D" | "Unknown";
  shares: number | null;
  price?: number | null;
  valueUSD?: number | null;      // shares * price if available
  source: "FMP" | "Finnhub" | "SEC";
  filingUrl?: string;            // for SEC / vendor links
  cik?: string;
};

function j(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function bad(message: string, status = 400) {
  return j({ ok: false, error: message }, { status });
}
function ok(data: InsiderRow[], fallbackUsed: string[]) {
  return j({
    ok: true,
    count: data.length,
    fallbacksTried: fallbackUsed,
    data,
  });
}

// ----- helpers -----
function toISO(d?: string | null) {
  if (!d) return "";
  // already like YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const m = d.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  // some vendors use YYYYMMDD
  const m2 = d.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return d;
}
function toTxn(letter?: string | null): InsiderRow["transactionType"] {
  if (!letter) return "Unknown";
  const x = letter.toUpperCase();
  if (x === "P" || x === "A") return "Buy";  // Purchase/Acquisition
  if (x === "S" || x === "D") return "Sell"; // Sale/Disposition
  return "Unknown";
}
function safeNum(n: any): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

// ----- 1) FMP -----
async function fetchFromFMP(symbol?: string, limit = 50): Promise<InsiderRow[]> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return [];

  // Symbol-specific feed; fall back to recent market feed if no symbol
  const url = symbol
    ? `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${encodeURIComponent(
        symbol
      )}&limit=${limit}&apikey=${apiKey}`
    : `https://financialmodelingprep.com/api/v4/insider-trading?limit=${limit}&apikey=${apiKey}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`FMP fetch failed (${r.status})`);
  const rows: any[] = await r.json();
  if (!Array.isArray(rows)) return [];

  const mapped: InsiderRow[] = rows.map((x) => {
    // FMP fields vary; commonly:
    // x.symbol, x.transactionDate, x.reportingName, x.securitiesTransacted, x.price, x.acquisitionOrDisposition ('A'|'D'), x.link
    const shares = safeNum(x.securitiesTransacted ?? x.sharesNumber);
    const price = safeNum(x.price);
    const valueUSD =
      shares !== null && price !== null ? Number((shares * price).toFixed(2)) : null;

    let txn: InsiderRow["transactionType"] = "Unknown";
    if (x.acquisitionOrDisposition) {
      txn = toTxn(String(x.acquisitionOrDisposition));
    } else if (x.transactionType) {
      txn = toTxn(String(x.transactionType));
    }

    return {
      symbol: x.symbol ?? "",
      insiderName: x.reportingName ?? x.ownerCik ?? "Unknown",
      tradeDate: toISO(x.transactionDate ?? x.filingDate),
      transactionType: txn,
      shares,
      price,
      valueUSD,
      source: "FMP",
      filingUrl: x.link || undefined,
      cik: x.cik || x.ownerCik || undefined,
    };
  });

  return mapped.slice(0, limit);
}

// ----- 2) Finnhub -----
async function fetchFromFinnhub(symbol?: string, limit = 50): Promise<InsiderRow[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token || !symbol) return [];

  const url = `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(
    symbol
  )}&token=${token}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Finnhub fetch failed (${r.status})`);
  const data: any = await r.json();

  const arr: any[] = Array.isArray(data?.data) ? data.data : [];
  const mapped: InsiderRow[] = arr.map((x) => {
    const shares = safeNum(x.share);
    const price = safeNum(x.price);
    const valueUSD =
      shares !== null && price !== null ? Number((shares * price).toFixed(2)) : null;

    return {
      symbol: x.symbol ?? symbol ?? "",
      insiderName: x.name ?? "Unknown",
      tradeDate: toISO(x.transactionDate ?? x.filingDate ?? x.time),
      transactionType: toTxn(x.transaction), // Finnhub uses 'P'/'S'
      shares,
      price,
      valueUSD,
      source: "Finnhub",
      filingUrl: undefined, // Finnhub doesn’t provide direct links for each row
      cik: x.cik || undefined,
    };
  });

  // Finnhub often returns many; trim
  return mapped.slice(0, limit);
}

// ----- 3) SEC (Form 4 lightweight) -----
// We only attempt SEC if a CIK is provided.
// This provides quick links to recent Form 4s when feeds are empty.
async function fetchFromSEC(cik: string, limit = 50): Promise<InsiderRow[]> {
  if (!cik) return [];
  const padded = cik.replace(/\D/g, "").padStart(10, "0");

  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Herevna.io (contact@herevna.io)",
      "Accept-Encoding": "gzip, deflate",
    },
    cache: "no-store",
  });

  if (!r.ok) throw new Error(`SEC fetch failed (${r.status})`);
  const data: any = await r.json();

  const recent = data?.filings?.recent || {};
  const forms: string[] = recent.form || [];
  const acc: string[] = recent.accessionNumber || [];
  const dates: string[] = recent.filingDate || [];
  const tickers: string[] = data?.tickers || [];
  const symbol = tickers[0] || "";

  const out: InsiderRow[] = [];
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] !== "4") continue; // only Form 4 for insider trades
    const accession = acc[i];
    if (!accession) continue;

    const accessionNoDashes = accession.replace(/-/g, "");
    const filingUrl = `https://www.sec.gov/Archives/edgar/data/${Number(
      padded
    )}/${accessionNoDashes}/${accession}-index.htm`;

    out.push({
      symbol,
      insiderName: "See Form 4 (details inside)",
      tradeDate: toISO(dates[i]),
      transactionType: "Unknown", // would require parsing primary doc XML for precise P/S
      shares: null,
      price: null,
      valueUSD: null,
      source: "SEC",
      filingUrl,
      cik: padded,
    });

    if (out.length >= limit) break;
  }

  return out;
}

// ----- API handler -----
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.trim().toUpperCase();
    const cik = searchParams.get("cik")?.trim(); // numeric as string (no 0x), we’ll pad inside SEC fn
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 200);

    const tried: string[] = [];
    let results: InsiderRow[] = [];

    // 1) FMP
    try {
      tried.push("FMP");
      const r1 = await fetchFromFMP(symbol, limit);
      if (r1.length) {
        results = r1;
        return ok(results, tried);
      }
    } catch (e) {
      // swallow and continue
    }

    // 2) Finnhub (only if we have a symbol; Finnhub requires it)
    try {
      if (symbol) {
        tried.push("Finnhub");
        const r2 = await fetchFromFinnhub(symbol, limit);
        if (r2.length) {
          results = r2;
          return ok(results, tried);
        }
      }
    } catch (e) {
      // swallow and continue
    }

    // 3) SEC (only if caller provided a CIK — avoids brittle symbol→CIK lookups here)
    try {
      if (cik) {
        tried.push("SEC");
        const r3 = await fetchFromSEC(cik, limit);
        if (r3.length) {
          results = r3;
          return ok(results, tried);
        }
      }
    } catch (e) {
      // swallow and continue
    }

    // no data anywhere
    return ok([], tried);
  } catch (err: any) {
    return bad(err?.message || "Unexpected error", 500);
  }
}