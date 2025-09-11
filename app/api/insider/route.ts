// app/api/insider/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // no caching
export const runtime = "nodejs";

const FMP_KEY = process.env.FMP_API_KEY;
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

type UiRow = {
  id: string;
  insider: string;
  issuer: string;
  symbol?: string;
  filedAt: string;
  type?: "A" | "D";
  beneficialShares?: number; // post-transaction
  price?: number;
  valueUSD?: number;
  docUrl?: string;
  title?: string;
  cik?: string | number;
  accessionNumber?: string;
  primaryDocument?: string;
};

function parseNum(n: any): number | undefined {
  if (n == null) return undefined;
  if (typeof n === "number") return Number.isFinite(n) ? n : undefined;
  if (typeof n === "string") {
    const v = Number(n.replace(/[$, ]/g, ""));
    return Number.isFinite(v) ? v : undefined;
  }
  return undefined;
}

function val(n?: number, p?: number) {
  return n != null && p != null ? n * p : undefined;
}

function normalizeDate(s?: string) {
  // prefer YYYY-MM-DD
  if (!s) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // try to cut timestamps to YYYY-MM-DD
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : s;
}

function okSymbol(sym?: string) {
  if (!sym) return undefined;
  return sym.toUpperCase().trim();
}

/* --------- FMP normalizer (v4/insider-trading) ----------
   Example fields from FMP:
   - symbol, filIngDate, transactionDate, acquisitionOrDisposition ("A"/"D")
   - securityName, reportingCik, reportingName, transactionPrice, transactionShares,
     sharesOwnedFollowingTransaction, link (filing URL)
--------------------------------------------------------- */
function normalizeFmp(items: any[] = []): UiRow[] {
  return items.map((d: any, i: number): UiRow => {
    const symbol = okSymbol(d.symbol);
    const type = d.acquisitionOrDisposition === "A" || d.acquisitionOrDisposition === "D" ? d.acquisitionOrDisposition : undefined;
    const price = parseNum(d.transactionPrice);
    const qty = parseNum(d.transactionShares);
    const beneficial = parseNum(d.sharesOwnedFollowingTransaction);

    // use filingDate or transactionDate for “filedAt”
    const filedAt = normalizeDate(d.filingDate || d.transactionDate);

    // try to shape an SEC URL if missing
    let docUrl: string | undefined = d.link;
    const cik = d.reportingCik ?? d.cik;
    const acc = d.accessionNumber ?? d.accession;
    const primaryDoc = d.primaryDocument ?? d.primary;

    if (!docUrl && cik && acc) {
      const noZeros = String(cik).replace(/^0+/, "");
      const flatAcc = String(acc).replace(/-/g, "");
      docUrl = `https://www.sec.gov/Archives/edgar/data/${noZeros}/${flatAcc}/${primaryDoc || "index.htm"}`;
    }

    return {
      id: d.id || d.accessionNumber || `${symbol || "FMP"}-${i}`,
      insider: d.reportingName || d.ownerName || "—",
      issuer: d.issuerName || d.companyName || d.issuer || symbol || "—",
      symbol,
      filedAt,
      type,
      beneficialShares: beneficial,
      price,
      valueUSD: val(qty, price),
      docUrl,
      title: d.securityName || undefined,
      cik,
      accessionNumber: acc,
      primaryDocument: primaryDoc,
    };
  });
}

/* --------- Finnhub normalizer (stock/insider-transactions) ----------
   Example fields from Finnhub:
   - symbol, name, share, change (0 buy, 1 sell not consistent; we’ll rely on transaction type if given),
     transactionPrice (d.price), transactionDate (d.transactionDate or d.filingDate),
     filings? not always present; url may be absent
--------------------------------------------------------------------- */
function normalizeFinnhub(items: any[] = []): UiRow[] {
  return items.map((d: any, i: number): UiRow => {
    const symbol = okSymbol(d.symbol);
    const price = parseNum(d.price);
    const qty = parseNum(d.share) ?? parseNum(d.shares);
    const filedAt = normalizeDate(d.filingDate || d.transactionDate || d.date);

    // Finnhub doesn’t always provide A/D; heuristics (positive shares => A; negative => D)
    let type: "A" | "D" | undefined = undefined;
    if (typeof qty === "number") {
      if (qty > 0) type = "A";
      if (qty < 0) type = "D";
    }
    if (d.transactionType === "A" || d.transactionType === "D") {
      type = d.transactionType;
    }

    return {
      id: d.id || `${symbol || "FINN"}-${i}`,
      insider: d.name || d.owner || "—",
      issuer: d.company || symbol || "—",
      symbol,
      filedAt,
      type,
      beneficialShares: parseNum(d.ownedFollowing) ?? parseNum(d.sharesOwnedFollowingTransaction),
      price,
      valueUSD: val(Math.abs(qty ?? 0), price),
      docUrl: d.url || d.link || undefined,
      title: d.title || d.position || undefined,
    };
  });
}

/* --------- SEC fallback (submissions JSON) ----------
   Only to provide basic filing links (price/qty not guaranteed).
   We’ll fetch the company’s submissions and filter form “4”.
----------------------------------------------------- */
async function secFallback(symbol: string, start: string, end: string): Promise<UiRow[]> {
  try {
    // 1) Resolve ticker->CIK (via SEC ticker file)
    const tRes = await fetch("https://www.sec.gov/files/company_tickers_exchange.json", {
      headers: { "User-Agent": "herevna.io (contact@herevna.io)" },
    });
    if (!tRes.ok) return [];
    const tJson: any = await tRes.json();
    // find matching symbol
    const entry = Object.values(tJson as any[]).find(
      (r: any) => (r?.ticker || "").toUpperCase() === symbol
    ) as any | undefined;
    if (!entry?.cik) return [];
    const cik = String(entry.cik).padStart(10, "0");

    // 2) Pull submissions
    const sRes = await fetch(`https://www.sec.gov/submissions/CIK${cik}.json`, {
      headers: { "User-Agent": "herevna.io (contact@herevna.io)" },
    });
    if (!sRes.ok) return [];
    const sJson: any = await sRes.json();
    const f = sJson?.filings?.recent;
    if (!f) return [];

    const forms: string[] = f.form || [];
    const accs: string[] = f.accessionNumber || [];
    const prims: string[] = f.primaryDocument || [];
    const filed: string[] = f.filingDate || [];
    const issuers: string[] = f.companyName || [];

    const startMs = Date.parse(start);
    const endMs = Date.parse(end);

    const rows: UiRow[] = [];
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] !== "4") continue;
      const filedAt = filed[i];
      const ts = Date.parse(filedAt);
      if (Number.isFinite(startMs) && ts < startMs) continue;
      if (Number.isFinite(endMs) && ts > endMs) continue;

      const acc = accs[i];
      const primaryDoc = prims[i] || "index.htm";
      const noZeros = cik.replace(/^0+/, "");
      const flatAcc = String(acc).replace(/-/g, "");
      const docUrl = `https://www.sec.gov/Archives/edgar/data/${noZeros}/${flatAcc}/${primaryDoc}`;

      rows.push({
        id: `${symbol}-SEC-${i}`,
        insider: "—",
        issuer: issuers[i] || symbol,
        symbol,
        filedAt,
        type: undefined,
        beneficialShares: undefined,
        price: undefined,
        valueUSD: undefined,
        docUrl,
        title: "Form 4 (fallback)",
        cik,
        accessionNumber: acc,
        primaryDocument: primaryDoc,
      });
    }
    return rows;
  } catch (e) {
    console.error("SEC fallback error:", e);
    return [];
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = okSymbol(url.searchParams.get("symbol") || "");
    const start = url.searchParams.get("start") || "2024-01-01";
    const end = url.searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const type = (url.searchParams.get("type") || "ALL").toUpperCase() as "ALL" | "A" | "D";

    if (!symbol) {
      return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
    }

    // If no keys, return a mock so the UI isn't empty (helps diagnose wiring)
    if (!FMP_KEY && !FINNHUB_KEY) {
      const mock: UiRow[] = [
        {
          id: "mock-1",
          insider: "Sample Insider",
          issuer: symbol,
          symbol,
          filedAt: start,
          type: "D",
          beneficialShares: 120000,
          price: 125.5,
          valueUSD: 125.5 * 1000,
          docUrl: "https://www.sec.gov/Archives/edgar/data/0000000000/0000000000-25-000001/index.htm",
          title: "Common Stock",
        },
      ];
      return NextResponse.json({ ok: true, data: mock });
    }

    let rows: UiRow[] = [];

    // 1) FMP first
    if (FMP_KEY) {
      try {
        const fmpURL = new URL("https://financialmodelingprep.com/api/v4/insider-trading");
        fmpURL.searchParams.set("symbol", symbol);
        fmpURL.searchParams.set("from", start);
        fmpURL.searchParams.set("to", end);
        fmpURL.searchParams.set("apikey", FMP_KEY);

        const fmpRes = await fetch(fmpURL.toString(), { cache: "no-store" });
        if (!fmpRes.ok) throw new Error(`FMP failed: ${fmpRes.status}`);
        const fmpJson = (await fmpRes.json()) as any[];
        const fmpRows = normalizeFmp(Array.isArray(fmpJson) ? fmpJson : []);
        rows = fmpRows;
      } catch (e) {
        console.error("FMP fetch error:", e);
      }
    }

    // 2) Finnhub fallback if needed
    if (rows.length === 0 && FINNHUB_KEY) {
      try {
        const fhURL = new URL("https://finnhub.io/api/v1/stock/insider-transactions");
        fhURL.searchParams.set("symbol", symbol);
        fhURL.searchParams.set("from", start);
        fhURL.searchParams.set("to", end);
        fhURL.searchParams.set("token", FINNHUB_KEY);

        const fhRes = await fetch(fhURL.toString(), { cache: "no-store" });
        if (!fhRes.ok) throw new Error(`Finnhub failed: ${fhRes.status}`);
        const fhJson = await fhRes.json();
        const list = Array.isArray(fhJson?.data) ? fhJson.data : Array.isArray(fhJson?.transactions) ? fhJson.transactions : [];
        const fhRows = normalizeFinnhub(list);
        rows = fhRows;
      } catch (e) {
        console.error("Finnhub fetch error:", e);
      }
    }

    // 3) SEC submissions fallback (links only)
    if (rows.length === 0) {
      const secRows = await secFallback(symbol, start, end);
      rows = secRows;
    }

    // Final filter by A/D (if requested)
    if (type === "A" || type === "D") {
      rows = rows.filter((r) => r.type === type);
    }

    return NextResponse.json({ ok: true, data: rows });
  } catch (e: any) {
    console.error("Insider API fatal error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Internal error" }, { status: 500 });
  }
}