// app/api/insider/route.ts
import { NextRequest, NextResponse } from "next/server";

/** -------- Types returned to the UI -------- */
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
  indexHtml?: string;
  docUrl?: string; // primary XML/HTM chosen
};

/** -------- Config -------- */
const SEC_BASE = "https://data.sec.gov";
const SEC_UA =
  process.env.SEC_USER_AGENT_EMAIL
    ? `Herevna.io bot (${process.env.SEC_USER_AGENT_EMAIL})`
    : "Herevna.io bot (contact@herevna.io)";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://herevna.io";
const FMP_API_KEY = process.env.FMP_API_KEY;

/** -------- Small helpers -------- */
let TICKER_CACHE:
  | { bySymbol: Map<string, { cik: string; title: string }>; ts: number }
  | null = null;

function padCIK(raw: string | null | undefined) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.replace(/^0+/, "").padStart(10, "0");
}

async function fetchJSON<T = any>(url: string) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": SEC_UA,
      "Accept": "application/json",
      "Referer": SITE_URL,
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`fetch failed ${r.status} for ${url}`);
  return (await r.json()) as T;
}

async function fetchText(url: string) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": SEC_UA,
      "Accept": "text/plain,application/xml,text/html;q=0.9,*/*;q=0.8",
      "Referer": SITE_URL,
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`fetch failed ${r.status} for ${url}`);
  return await r.text();
}

/** Load SEC official ticker list and cache in-memory */
async function loadTickerIndex() {
  const now = Date.now();
  if (TICKER_CACHE && now - TICKER_CACHE.ts < 6 * 60 * 60 * 1000) return TICKER_CACHE;

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

/** Try to resolve CIK from query: cik > symbol > issuer fuzzy */
async function resolveCIK(searchParams: URLSearchParams) {
  const rawCIK = searchParams.get("cik");
  const symbolIn = (searchParams.get("symbol") || "").toUpperCase().trim();
  const issuerIn = (searchParams.get("issuer") || "").trim();

  if (rawCIK) {
    const cik = padCIK(rawCIK);
    if (cik) return { cik, from: "cik" as const };
  }

  const idx = await loadTickerIndex();

  if (symbolIn) {
    const candidates = [
      symbolIn,
      symbolIn.replace(/\./g, "-"),
      symbolIn.replace(/-/g, "."),
    ];
    for (const c of candidates) {
      const hit = idx.bySymbol.get(c);
      if (hit) return { cik: hit.cik, from: "symbol" as const, title: hit.title, symbol: c };
    }
  }

  if (issuerIn) {
    const needle = issuerIn.toLowerCase();
    for (const [sym, info] of idx.bySymbol.entries()) {
      if (info.title.toLowerCase().includes(needle)) {
        return { cik: info.cik, from: "issuer" as const, title: info.title, symbol: sym };
      }
    }
  }

  return null;
}

/** Very small XML helpers (avoid adding deps) */
function pickTag(text: string, tag: string): string | undefined {
  // returns innerText of first <tag>...</tag>
  const m = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m?.[1]?.trim();
}

function pickAll(text: string, tag: string): string[] {
  const rx = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) out.push(m[1].trim());
  return out;
}

function asNumber(x?: string | null): number | undefined {
  if (!x) return undefined;
  const n = Number(x.replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** Extract core Form 4 fields (first Non-Derivative transaction row) */
function parseForm4(xml: string) {
  const issuerName = pickTag(xml, "issuerName") || pickTag(xml, "issuerName|issuer") || "—";
  const issuerTradingSymbol = pickTag(xml, "issuerTradingSymbol") || undefined;
  const insiderName =
    pickTag(xml, "rptOwnerName") ||
    pickTag(xml, "reportingOwnerId") ||
    "—";

  // Non-derivative table rows
  const rows = pickAll(xml, "nonDerivativeTransaction");
  let action: "A" | "D" | "—" = "—";
  let shares: number | undefined;
  let price: number | undefined;
  let ownedFollowing: number | undefined;

  if (rows.length) {
    // choose the first transaction (most filings have one or a few)
    const row = rows[0];
    const acqDisp = pickTag(row, "transactionAcquiredDisposedCode") || pickTag(row, "transactionAcquiredDisposedCode|value");
    const sharesStr =
      pickTag(row, "transactionShares") ||
      pickTag(row, "transactionShares|value");
    const priceStr =
      pickTag(row, "transactionPricePerShare") ||
      pickTag(row, "transactionPricePerShare|value");

    action = acqDisp?.includes("A") ? "A" : acqDisp?.includes("D") ? "D" : "—";
    shares = asNumber(sharesStr);
    price = asNumber(priceStr);
  }

  // post transaction amounts
  const ownedStr =
    pickTag(xml, "sharesOwnedFollowingTransaction") ||
    pickTag(xml, "ownershipDirectOrIndirect") || // fallback if table missing
    undefined;
  ownedFollowing = asNumber(ownedStr);

  return {
    issuerName,
    issuerTradingSymbol,
    insiderName,
    action,
    shares,
    price,
    ownedFollowing,
  };
}

/** Build SEC directory links safely from accession + cik */
function secDirLinks(cik10: string, accession: string) {
  const cikNoLeading = String(parseInt(cik10, 10)); // strip leading zeros
  const accPath = accession.replace(/-/g, "");
  const baseDir = `${SEC_BASE}/Archives/edgar/data/${cikNoLeading}/${accPath}`;
  return {
    baseDir,
    indexHtml: `${baseDir}/index.html`,
    indexJson: `${baseDir}/index.json`,
  };
}

/** Choose primary document from directory listing */
function choosePrimaryFromIndex(index: any): string | null {
  // next’s index.json looks like: { item: [{name:"", type:"", href:""} , ...] }
  const items: { name?: string; href?: string }[] = index?.directory?.item || index?.item || [];
  if (!Array.isArray(items) || !items.length) return null;

  // Prefer XML that looks like a Form 4 filing
  const xmlFirst = items.find((it) => (it.name || it.href || "").toLowerCase().endsWith(".xml"));
  if (xmlFirst?.href) return xmlFirst.href;

  // Otherwise an HTM/HTML doc
  const htm = items.find((it) => {
    const n = (it.name || it.href || "").toLowerCase();
    return n.endsWith(".htm") || n.endsWith(".html");
  });
  if (htm?.href) return htm.href;

  // Fallback to first item
  return items[0]?.href || null;
}

/** Try SEC path; on failure, fallback to FMP if available */
async function fetchInsiderTapeSEC(cik: string, start?: string, end?: string): Promise<TapeRow[]> {
  // Get recent submissions
  const subs = await fetchJSON<any>(`${SEC_BASE}/submissions/CIK${cik}.json`);
  const filings = subs?.filings?.recent;
  if (!filings) return [];

  const out: TapeRow[] = [];
  const n = filings.form?.length || 0;

  for (let i = 0; i < n; i++) {
    if (filings.form[i] !== "4") continue;

    const acc = filings.accessionNumber?.[i];
    const filed = filings.filingDate?.[i];
    if (!acc || !filed) continue;

    if (start && filed < start) continue;
    if (end && filed > end) continue;

    const { baseDir, indexHtml, indexJson } = secDirLinks(
      subs?.cik ? String(subs.cik).padStart(10, "0") : cik,
      acc
    );

    // Discover the real file list
    let docUrl: string | undefined;
    let parsed: ReturnType<typeof parseForm4> | null = null;

    try {
      const dir = await fetchJSON<any>(indexJson);
      const href = choosePrimaryFromIndex(dir);
      if (href) {
        // href is relative to baseDir
        docUrl = `${baseDir}/${href.replace(/^\.?\//, "")}`;

        if (docUrl.toLowerCase().endsWith(".xml")) {
          const xml = await fetchText(docUrl);
          parsed = parseForm4(xml);
        } else {
          // try to find an XML in the directory even if primary is HTM
          const items = dir?.directory?.item || dir?.item || [];
          const xmlItem = items.find((it: any) =>
            String(it?.href || it?.name || "").toLowerCase().endsWith(".xml")
          );
          if (xmlItem?.href) {
            const xmlUrl = `${baseDir}/${String(xmlItem.href).replace(/^\.?\//, "")}`;
            const xml = await fetchText(xmlUrl);
            parsed = parseForm4(xml);
          }
        }
      }
    } catch {
      // directory lookup failed -> we’ll still return a minimal row
    }

    const price = parsed?.price;
    const shares = parsed?.shares;
    const value = price && shares ? Math.round(price * shares * 100) / 100 : undefined;

    out.push({
      insider: parsed?.insiderName || "—",
      issuer: parsed?.issuerName || subs?.name || "—",
      symbol: parsed?.issuerTradingSymbol,
      filedAt: filed,
      action: parsed?.action ?? "—",
      shares,
      price,
      value,
      ownedFollowing: parsed?.ownedFollowing,
      accessionNumber: acc,
      indexHtml,
      docUrl,
    });
  }

  return out;
}

async function fetchInsiderTapeFMP(symbol: string, start?: string, end?: string): Promise<TapeRow[]> {
  if (!FMP_API_KEY) return [];
  const url = new URL("https://financialmodelingprep.com/api/v4/insider-trading");
  url.searchParams.set("symbol", symbol);
  if (start) url.searchParams.set("from", start);
  if (end) url.searchParams.set("to", end);
  url.searchParams.set("apikey", FMP_API_KEY);

  const data = await fetchJSON<any[]>(url.toString());

  // Map to TapeRow as best as possible (FMP field names)
  return (data || []).map((d) => {
    const price = asNumber(d?.transactionPrice);
    const shares = asNumber(d?.transactionShares);
    const value = price && shares ? Math.round(price * shares * 100) / 100 : undefined;
    const action = (String(d?.acquisitionOrDisposition || "").toUpperCase().includes("A")
      ? "A"
      : String(d?.acquisitionOrDisposition || "").toUpperCase().includes("D")
      ? "D"
      : "—") as "A" | "D" | "—";

    return {
      insider: d?.reportingName || d?.reportingCik || "—",
      issuer: d?.issuerName || "—",
      symbol: d?.symbol || undefined,
      filedAt: d?.filingDate || d?.filingDateTime || "—",
      action,
      shares,
      price,
      value,
      ownedFollowing: asNumber(d?.postTransactionAmount),
      accessionNumber: d?.accessionNumber,
      indexHtml: d?.link || undefined,
      docUrl: d?.link || undefined,
    };
  });
}

/** -------- Route handler -------- */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    if (!searchParams.get("cik") && !searchParams.get("symbol") && !searchParams.get("issuer")) {
      return NextResponse.json({ error: "Provide a symbol, CIK, or issuer." }, { status: 400 });
    }

    const resolved = await resolveCIK(searchParams);
    if (!resolved?.cik) {
      return NextResponse.json({ error: "Could not resolve CIK from inputs." }, { status: 400 });
    }

    const cik = resolved.cik;
    const start = searchParams.get("start") || undefined; // YYYY-MM-DD
    const end = searchParams.get("end") || undefined;     // YYYY-MM-DD
    const txnType = (searchParams.get("action") || "ALL").toUpperCase() as "ALL" | "A" | "D";

    let rows: TapeRow[] = [];
    try {
      rows = await fetchInsiderTapeSEC(cik, start, end);
    } catch (e) {
      // SEC blocked or missing index? fallback to FMP if symbol available
      if (resolved.symbol && FMP_API_KEY) {
        rows = await fetchInsiderTapeFMP(resolved.symbol, start, end);
      } else {
        throw e;
      }
    }

    // Optional filter by A/D
    if (txnType !== "ALL") {
      rows = rows.filter((r) => r.action === txnType);
    }

    return NextResponse.json({
      ok: true,
      source: rows.length && rows[0]?.docUrl ? "SEC" : FMP_API_KEY ? "FMP" : "SEC",
      resolvedFrom: resolved.from,
      cik,
      symbol: resolved.symbol,
      data: rows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}