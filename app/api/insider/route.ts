// app/api/insider/route.ts
import { NextRequest, NextResponse } from "next/server";

type TapeRow = {
  insider: string;
  issuer: string;
  symbol?: string;
  filedAt: string;
  action: "A" | "D" | "—";
  shares?: number;
  price?: number;
  value?: number;
  ownedFollowing?: number;
  accessionNumber?: string;
  formUrl?: string;
  indexUrl?: string;
};

// ---- CONFIG ----
const SEC_BASE = "https://data.sec.gov";
const SEC_UA =
  process.env.SEC_USER_AGENT_EMAIL
    ? `Herevna.io bot (${process.env.SEC_USER_AGENT_EMAIL})`
    : "Herevna.io bot (contact@herevna.io)";

// Keep the SEC ticker index in-memory for this lambda instance
let TICKER_CACHE: { bySymbol: Map<string, { cik: string; title: string }>; ts: number } | null = null;

// fetch JSON with proper headers
async function fetchJSON<T = any>(url: string) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": SEC_UA,
      "Accept": "application/json",
      "Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://herevna.io",
    },
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`fetch failed ${r.status} for ${url}`);
  }
  return (await r.json()) as T;
}

function padCIK(raw: string) {
  const digits = (raw || "").replace(/^\s*0+/, "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.padStart(10, "0");
}

async function loadTickerIndex() {
  // refresh at most every 6 hours
  const now = Date.now();
  if (TICKER_CACHE && now - TICKER_CACHE.ts < 6 * 60 * 60 * 1000) return TICKER_CACHE;

  // SEC official symbol→CIK list
  // Structure: { "0": {cik_str, ticker, title}, "1": {...}, ... }
  const data = await fetchJSON<Record<string, { cik_str: number; ticker: string; title: string }>>(
    "https://www.sec.gov/files/company_tickers.json"
  );

  const bySymbol = new Map<string, { cik: string; title: string }>();
  for (const k of Object.keys(data)) {
    const row = data[k];
    if (!row?.ticker || row?.cik_str == null) continue;
    const sym = row.ticker.toUpperCase();
    const cik = String(row.cik_str).padStart(10, "0");
    bySymbol.set(sym, { cik, title: row.title });
  }

  TICKER_CACHE = { bySymbol, ts: now };
  return TICKER_CACHE;
}

async function resolveCIKFromQuery(qs: URLSearchParams) {
  // priority: cik > symbol > issuer
  const rawCIK = qs.get("cik");
  if (rawCIK) {
    const cik = padCIK(rawCIK);
    if (cik) return { cik, from: "query" as const };
  }

  const symbol = (qs.get("symbol") || "").toUpperCase().trim();
  if (symbol) {
    const { bySymbol } = await loadTickerIndex();
    // handle class tickers like BRK.A → BRK-A or BRK.A exact
    const candidates = [
      symbol,
      symbol.replace(/\./g, "-"),
      symbol.replace(/-/g, "."),
    ];
    for (const s of candidates) {
      const hit = bySymbol.get(s);
      if (hit) return { cik: hit.cik, from: "symbol" as const, title: hit.title, symbol: s };
    }
  }

  const issuer = (qs.get("issuer") || "").trim();
  if (issuer) {
    const { bySymbol } = await loadTickerIndex();
    // fuzzy: match first whose title contains the issuer query
    const needle = issuer.toLowerCase();
    for (const [sym, info] of bySymbol.entries()) {
      if (info.title.toLowerCase().includes(needle)) {
        return { cik: info.cik, from: "issuer" as const, title: info.title, symbol: sym };
      }
    }
  }

  return null;
}

function pickAction(code?: string): "A" | "D" | "—" {
  return code === "A" ? "A" : code === "D" ? "D" : "—";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // Validate we have at least one identifier before doing anything
    const hasAnyId =
      !!(searchParams.get("cik") || searchParams.get("symbol") || searchParams.get("issuer"));
    if (!hasAnyId) {
      return NextResponse.json({ error: "Provide a symbol, CIK, or issuer." }, { status: 400 });
    }

    const resolved = await resolveCIKFromQuery(searchParams);
    if (!resolved?.cik) {
      return NextResponse.json(
        { error: "Could not resolve CIK from inputs." },
        { status: 400 }
      );
    }
    const cik = resolved.cik;

    // date filters (optional)
    const start = searchParams.get("start"); // YYYY-MM-DD
    const end = searchParams.get("end");     // YYYY-MM-DD
    const actionFilter = (searchParams.get("action") || "ALL").toUpperCase() as "ALL" | "A" | "D";

    // Fetch submissions to find latest Form 4s
    const submissionsUrl = `${SEC_BASE}/submissions/CIK${cik}.json`;
    const subs = await fetchJSON<any>(submissionsUrl);

    const filings = subs?.filings?.recent;
    if (!filings) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    // Build rows from recent "4" forms
    const rows: TapeRow[] = [];
    const n = filings.form?.length || 0;
    for (let i = 0; i < n; i++) {
      if (filings.form[i] !== "4") continue;

      const acc = filings.accessionNumber?.[i];
      const filed = filings.filingDate?.[i];
      if (!acc || !filed) continue;

      // Apply date range, if given
      if (start && filed < start) continue;
      if (end && filed > end) continue;

      // Primary doc & index
      const accPath = acc.replace(/-/g, "");
      const companyCIK = subs?.cik ? String(subs.cik).padStart(10, "0") : cik;
      const baseDir = `${SEC_BASE}/Archives/edgar/data/${parseInt(companyCIK, 10)}/${accPath}`;
      const indexUrl = `${baseDir}/index.json`;
      let primaryDoc = filings.primaryDocument?.[i] || "xslF345X03/primary_doc.xml";
      // some filings have only XML in primaryDocument
      const formUrl = `${baseDir}/${primaryDoc}`;

      // Minimal row; details (price/shares/value) come later if you’re parsing the XML.
      rows.push({
        insider: (subs?.entityType || "Insider"),
        issuer: subs?.name || resolved.title || "—",
        symbol: resolved.symbol,
        filedAt: filed,
        action: "—",
        accessionNumber: acc,
        indexUrl,
        formUrl,
      });
    }

    // Optional action filter (we don’t parse XML here; action will be "—" unless you added the XML parser)
    const filtered =
      actionFilter === "ALL" ? rows : rows.filter((r) => r.action === actionFilter);

    return NextResponse.json({ ok: true, data: filtered, cik, resolvedFrom: resolved.from });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}