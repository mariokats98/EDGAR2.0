// app/api/lookup/[symbol]/route.ts
import { NextResponse } from "next/server";

const UA =
  process.env.SEC_USER_AGENT ||
  "Herevna/1.0 (contact@herevna.io)"; // ensure this is set in Vercel

type LookupHit = { cik: string; name: string; ticker?: string; from?: string };
type QueryNorm =
  | { kind: "cik"; value: string }
  | { kind: "text"; value: string };

// in-memory cache of SEC ticker list
let TICKER_CACHE:
  | null
  | {
      byTicker: Map<string, { cik: string; name: string; ticker: string }>;
      byName: Map<string, { cik: string; name: string; ticker: string }[]>;
    } = null;

async function loadTickerCache() {
  if (TICKER_CACHE) return TICKER_CACHE;

  const url = "https://www.sec.gov/files/company_tickers.json";
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC tickers fetch failed (${r.status})`);
  const j = (await r.json()) as Record<
    string,
    { cik_str: number | string; ticker: string; title: string }
  >;

  const byTicker = new Map<string, { cik: string; name: string; ticker: string }>();
  const byName = new Map<string, { cik: string; name: string; ticker: string }[]>();

  for (const k of Object.keys(j)) {
    const row = j[k];
    if (!row) continue;
    const cik = String(row.cik_str).padStart(10, "0");
    const ticker = String(row.ticker || "").toUpperCase();
    const name = String(row.title || "").trim();
    if (!ticker || !cik) continue;

    const rec = { cik, name, ticker };

    byTicker.set(ticker, rec);

    // support dot/dash class variants
    if (ticker.includes(".")) byTicker.set(ticker.replace(/\./g, "-"), rec);
    if (ticker.includes("-")) byTicker.set(ticker.replace(/-/g, "."), rec);

    const nKey = name.toUpperCase();
    const arr = byName.get(nKey) || [];
    arr.push(rec);
    byName.set(nKey, arr);
  }

  TICKER_CACHE = { byTicker, byName };
  return TICKER_CACHE;
}

function normalizeQuery(raw: string): QueryNorm {
  const q = raw.trim();
  if (/^\d{1,10}$/.test(q)) {
    // Looks like a CIK
    return { kind: "cik", value: q.padStart(10, "0") };
  }
  // Otherwise treat as text (ticker/company)
  return { kind: "text", value: q.toUpperCase() };
}

async function searchCompanyIndex(q: string): Promise<LookupHit | null> {
  const params = new URLSearchParams({
    keys: `"${q}"`,
    category: "company",
    size: "10",
    sort: "date-desc",
  });
  const url = `https://efts.sec.gov/LATEST/search-index?${params.toString()}`;
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) return null;

  const j = await r.json().catch(() => null as any);
  const hits = j?.hits?.hits || [];
  for (const h of hits) {
    const src = h?._source || {};
    const cikRaw =
      (src.cik || src.cikNumber || src.cik_num || "").toString().replace(/\D/g, "");
    const name =
      (src.display_names?.[0] ||
        src.display_name ||
        src.entity ||
        src.name ||
        "") + "";
    const ticker = (src.tickers?.[0] || src.ticker || "") + "";
    if (cikRaw && name) {
      return {
        cik: cikRaw.padStart(10, "0"),
        name: name.trim(),
        ticker: ticker ? ticker.toUpperCase() : undefined,
        from: "sec-index",
      };
    }
  }
  return null;
}

export async function GET(
  req: Request,
  ctx: { params: { symbol: string } }
) {
  try {
    const raw = ctx.params.symbol || "";
    const norm = normalizeQuery(raw);

    // 1) Direct CIK
    if (norm.kind === "cik") {
      return NextResponse.json<LookupHit>({
        cik: norm.value,
        name: "Company",
        from: "cik",
      });
    }

    // 2) Try live ticker cache
    const cache = await loadTickerCache();

    // exact ticker (with dot/dash variants)
    const tUpper = norm.value;
    const variants = new Set<string>([
      tUpper,
      tUpper.replace(/\./g, "-"),
      tUpper.replace(/-/g, "."),
    ]);
    for (const v of variants) {
      const hit = cache.byTicker.get(v);
      if (hit) {
        return NextResponse.json<LookupHit>({ ...hit, from: "ticker" });
      }
    }

    // exact company name
    const byNameArr = cache.byName.get(tUpper);
    if (byNameArr && byNameArr.length) {
      const hit = byNameArr[0];
      return NextResponse.json<LookupHit>({ ...hit, from: "name-exact" });
    }

    // 3) Fuzzy company search via SEC index
    const fuzzy = await searchCompanyIndex(raw);
    if (fuzzy) return NextResponse.json<LookupHit>(fuzzy);

    return NextResponse.json(
      { error: "Ticker/Company not recognized." },
      { status: 404 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error." },
      { status: 500 }
    );
  }
}