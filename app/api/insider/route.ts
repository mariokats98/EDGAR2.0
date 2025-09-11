// app/api/insider/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Side = "buy" | "sell" | "all";

type InsiderRow = {
  symbol: string;
  insiderName: string;
  tradeDate: string; // YYYY-MM-DD
  transactionType: "Buy" | "Sell" | "A" | "D" | "Unknown";
  txnShares: number | null;      // Securities Acquired (A) or Disposed Of (D)
  price?: number | null;         // Price per share
  valueUSD?: number | null;      // txnShares * price
  ownedAfter?: number | null;    // Beneficially Owned Shares (postTransactionAmounts)
  source: "FMP" | "Finnhub" | "SEC";
  filingUrl?: string;            // direct doc xml/html
  indexUrl?: string;             // index page
  cik?: string;
};

function j(data: any, init?: ResponseInit) { return NextResponse.json(data, init); }
function bad(message: string, status = 400) { return j({ ok: false, error: message }, { status }); }
function ok(data: InsiderRow[], meta: any = {}) { return j({ ok: true, count: data.length, ...meta, data }); }

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
function safeNum(n: any): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(String(n).replace(/[, ]/g, ""));
  return Number.isFinite(v) ? v : null;
}
function calcValue(shares: number | null, price: number | null) {
  if (shares == null || price == null) return null;
  return Number((shares * price).toFixed(2));
}
function toTxn(letter?: string | null): InsiderRow["transactionType"] {
  if (!letter) return "Unknown";
  const x = letter.toUpperCase();
  if (x === "P" || x === "A") return "Buy";
  if (x === "S" || x === "D") return "Sell";
  return (["A","D"].includes(x) ? (x as "A" | "D") : "Unknown");
}
function matchesSide(txn: InsiderRow["transactionType"], side: Side) {
  if (side === "all") return true;
  if (side === "buy") return txn === "Buy";
  if (side === "sell") return txn === "Sell";
  return true;
}
function withinRange(dateISO: string, start?: string, end?: string) {
  if (!dateISO) return false;
  if (start && dateISO < start) return false;
  if (end && dateISO > end) return false;
  return true;
}

/* ------------------ FMP ------------------ */
async function fetchFromFMP(symbol?: string, start?: string, end?: string, side: Side = "all", limit = 50): Promise<InsiderRow[]> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return [];

  const url = symbol
    ? `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${encodeURIComponent(symbol)}&limit=${limit}&apikey=${apiKey}`
    : `https://financialmodelingprep.com/api/v4/insider-trading?limit=${limit}&apikey=${apiKey}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`FMP fetch failed (${r.status})`);
  const rows: any[] = await r.json();
  if (!Array.isArray(rows)) return [];

  return rows.map((x) => {
    const txnShares = safeNum(x.securitiesTransacted ?? x.sharesNumber ?? x.shares);
    let price = safeNum(x.price);
    let total = safeNum(x.finalPrice ?? x.value ?? x.transactionValue);
    if (price == null && total != null && txnShares != null && txnShares > 0) {
      price = Number((total / txnShares).toFixed(4));
    }
    const txn = toTxn(String(x.acquisitionOrDisposition ?? x.transactionType ?? ""));

    const row: InsiderRow = {
      symbol: x.symbol ?? "",
      insiderName: x.reportingName ?? x.insiderName ?? x.ownerCik ?? "Unknown",
      tradeDate: toISO(x.transactionDate ?? x.filingDate),
      transactionType: txn,
      txnShares,
      price,
      valueUSD: calcValue(txnShares, price) ?? total ?? null,
      ownedAfter: null,
      source: "FMP",
      filingUrl: x.link || undefined,
      cik: x.cik || x.ownerCik || undefined,
    };
    return row;
  })
  .filter((r) => r.tradeDate && withinRange(r.tradeDate, start, end) && matchesSide(r.transactionType, side))
  .slice(0, limit);
}

/* ------------------ Finnhub ------------------ */
async function fetchFromFinnhub(symbol?: string, start?: string, end?: string, side: Side = "all", limit = 50): Promise<InsiderRow[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token || !symbol) return [];

  const url = `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&token=${token}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Finnhub fetch failed (${r.status})`);
  const data: any = await r.json();

  let rows: InsiderRow[] = (Array.isArray(data?.data) ? data.data : []).map((x: any) => {
    const txnShares = safeNum(x.share);
    let price = safeNum(x.price);
    let total = safeNum(x.transactionValue);
    if (price == null && total != null && txnShares != null && txnShares > 0) {
      price = Number((total / txnShares).toFixed(4));
    }

    return {
      symbol: x.symbol ?? symbol ?? "",
      insiderName: x.name ?? "Unknown",
      tradeDate: toISO(x.transactionDate ?? x.filingDate ?? x.time),
      transactionType: toTxn(x.transaction), // "P" / "S" / "A" / "D"
      txnShares,
      price,
      valueUSD: calcValue(txnShares, price) ?? total ?? null,
      ownedAfter: null,
      source: "Finnhub",
      cik: x.cik || undefined,
    };
  });

  rows = rows
    .filter((r) => r.tradeDate && withinRange(r.tradeDate, start, end) && matchesSide(r.transactionType, side))
    .slice(0, limit);

  // Optionally enrich with SEC link if any CIK present
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
        const byDate: Record<string, string> = {};

        for (let i = 0; i < forms.length; i++) {
          if (forms[i] !== "4") continue;
          const accession = acc[i];
          const prim = primaryDoc[i];
          const date = toISO(fdates[i]);
          if (!accession || !date) continue;
          const accessionNoDashes = accession.replace(/-/g, "");
          const direct = prim
            ? `https://www.sec.gov/Archives/edgar/data/${Number(padded)}/${accessionNoDashes}/${prim}`
            : `https://www.sec.gov/Archives/edgar/data/${Number(padded)}/${accessionNoDashes}/${accession}-index.htm`;
          byDate[date] = direct;
        }

        rows = rows.map((row) =>
          (!row.filingUrl && row.tradeDate && byDate[row.tradeDate])
            ? { ...row, filingUrl: byDate[row.tradeDate] }
            : row
        );
      }
    } catch {}
  }

  return rows;
}

/* ------------------ SEC (Form 4) helpers ------------------ */
function pickFirstTxn(xml: string) {
  // prefer non-derivative transaction block
  const blocks =
    xml.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/gi) ||
    xml.match(/<derivativeTransaction>[\s\S]*?<\/derivativeTransaction>/gi) ||
    [];

  for (const block of blocks) {
    const date = block.match(/<transactionDate>\s*<value>([^<]+)<\/value>/i)?.[1];
    const code = block.match(/<transactionAcquiredDisposedCode>\s*<value>([^<]+)<\/value>/i)?.[1];
    const shares = safeNum(block.match(/<transactionShares>\s*<value>([^<]+)<\/value>/i)?.[1]);
    const price = safeNum(block.match(/<transactionPricePerShare>\s*<value>([^<]+)<\/value>/i)?.[1]);
    const ownedAfter = safeNum(
      xml.match(/<postTransactionAmounts>[\s\S]*?<sharesOwnedFollowingTransaction>\s*<value>([^<]+)<\/value>/i)?.[1]
    );

    if (shares != null) {
      return {
        date: toISO(date || ""),
        code: code?.trim().toUpperCase() || undefined,
        txnShares: shares,
        price,
        ownedAfter,
      };
    }
  }

  // fallback: owned-after only
  const ownedAfter = safeNum(
    xml.match(/<postTransactionAmounts>[\s\S]*?<sharesOwnedFollowingTransaction>\s*<value>([^<]+)<\/value>/i)?.[1]
  );
  if (ownedAfter != null) {
    return { date: "", code: undefined, txnShares: null, price: null, ownedAfter };
  }
  return null;
}

// If primary doc isn't XML, scrape the index page for the first .xml link
async function findXmlFromIndex(indexUrl: string): Promise<string | null> {
  try {
    const r = await fetch(indexUrl, { headers: UA_HEADERS, cache: "no-store" });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/href="([^"]+\.xml)"/i) || html.match(/>([^<]+\.xml)</i);
    if (!m) return null;

    let href = m[1] || m[0];
    href = href.replace(/^href=|>|<|"|'|\s/gi, "");
    if (href.startsWith("http")) return href;

    // build absolute path from indexUrl
    const base = indexUrl.replace(/[^/]+$/, "");
    return base + href.replace(/^\.?\//, "");
  } catch {
    return null;
  }
}

async function fetchFromSEC(cik: string, start?: string, end?: string, side: Side = "all", limit = 50): Promise<InsiderRow[]> {
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
  const symbol = (data?.tickers || [])[0] || "";

  const out: InsiderRow[] = [];

  for (let i = 0; i < forms.length; i++) {
    if (forms[i] !== "4") continue;

    const filingDate = toISO(dates[i]);
    if (!filingDate || !withinRange(filingDate, start, end)) continue;

    const accession = acc[i];
    if (!accession) continue;
    const accessionNoDashes = accession.replace(/-/g, "");
    const prim = primaryDoc[i];

    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${Number(padded)}/${accessionNoDashes}/${accession}-index.htm`;
    let directDoc = prim
      ? `https://www.sec.gov/Archives/edgar/data/${Number(padded)}/${accessionNoDashes}/${prim}`
      : indexUrl;

    // If not XML, try to discover xml from index page
    if (!/\.xml$/i.test(directDoc)) {
      const xmlGuess = await findXmlFromIndex(indexUrl);
      if (xmlGuess) directDoc = xmlGuess;
    }

    let txnShares: number | null = null;
    let price: number | null = null;
    let ownedAfter: number | null = null;
    let txnLetter: string | undefined;
    let txnDateISO: string | undefined;

    try {
      if (/\.xml$/i.test(directDoc)) {
        const rx = await fetch(directDoc, { headers: UA_HEADERS, cache: "no-store" });
        if (rx.ok) {
          const xml = await rx.text();
          const t = pickFirstTxn(xml);
          if (t) {
            txnShares = t.txnShares;
            price = t.price ?? null;
            ownedAfter = t.ownedAfter ?? null;
            txnLetter = t.code;
            txnDateISO = t.date || filingDate;
          }
        }
      }
    } catch {}

    const transactionType = toTxn(txnLetter);
    if (!matchesSide(transactionType, side)) continue;

    out.push({
      symbol,
      insiderName: "See Form 4 (details inside)",
      tradeDate: txnDateISO || filingDate,
      transactionType,
      txnShares,
      price,
      valueUSD: calcValue(txnShares, price),
      ownedAfter,
      source: "SEC",
      filingUrl: directDoc,
      indexUrl,
      cik: padded,
    });

    if (out.length >= limit) break;
  }

  return out;
}

/* ------------------ Handler ------------------ */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.trim().toUpperCase();
    const cik = searchParams.get("cik")?.trim();
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 200);
    const start = searchParams.get("start")?.trim() || undefined;
    const end = searchParams.get("end")?.trim() || undefined;
    const sideParam = (searchParams.get("side")?.trim().toLowerCase() || "all") as Side;
    const side: Side = sideParam === "buy" || sideParam === "sell" ? sideParam : "all";

    const tried: string[] = [];

    // FMP
    try {
      tried.push("FMP");
      const r1 = await fetchFromFMP(symbol, start, end, side, limit);
      if (r1.length) return ok(r1, { tried });
    } catch {}

    // Finnhub
    try {
      if (symbol) {
        tried.push("Finnhub");
        const r2 = await fetchFromFinnhub(symbol, start, end, side, limit);
        if (r2.length) return ok(r2, { tried });
      }
    } catch {}

    // SEC — when CIK provided
    try {
      if (cik) {
        tried.push("SEC");
        const r3 = await fetchFromSEC(cik, start, end, side, limit);
        if (r3.length) return ok(r3, { tried });
      }
    } catch {}

    return ok([], { tried });
  } catch (err: any) {
    return bad(err?.message || "Unexpected error", 500);
  }
}