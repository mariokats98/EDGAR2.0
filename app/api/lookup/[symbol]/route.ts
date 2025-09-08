// app/api/lookup/[symbol]/route.ts
import { NextResponse } from "next/server";

const UA =
  process.env.SEC_USER_AGENT ||
  "Herevna/1.0 (contact@herevna.io)"; // Make sure this matches your Vercel env

// Cache the SEC company tickers list in memory across invocations
let TICKER_CACHE: null | {
  byTicker: Map<string, { cik: string; name: string; ticker: string }>;
  byName: Map<string, { cik: string; name: string; ticker: string }[]>;
} = null;

async function loadTickerCache() {
  if (TICKER_CACHE) return TICKER_CACHE;
  // Official SEC list: [{cik_str, ticker, title}]
  const url = "https://www.sec.gov/files/company_tickers.json";
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC tickers fetch failed (${r.status})`);
  const j = await r.json();

  const byTicker = new Map<string, { cik: string; name: string; ticker: string }>();
  const byName = new Map<string, { cik: string; name: string; ticker: string }[]>();

  // The JSON is an object with numeric keys: {"0": {cik_str, ticker, title}, ...}
  for (const k of Object.keys(j)) {
    const row = j[k];
    if (!row) continue;
    const cik = String(row.cik_str).padStart(10, "0");
    const ticker = String(row.ticker || "").toUpperCase();
    const name = String(row.title || "").trim();
    if (!ticker || !cik) continue;

    byTicker.set(ticker, { cik, name, ticker });

    const nKey = name.toUpperCase();
    const arr = byName.get(nKey) || [];
    arr.push({ cik, name, ticker });
    byName.set(nKey, arr);

    // Also map some common class/variant forms (BRK.B -> BRK-B, and vice versa)
    if (ticker.includes(".")) {
      byTicker.set(ticker.replace(/\./g, "-"), { cik, name, ticker });
    } else if (ticker.includes("-")) {
      byTicker.set(ticker.replace(/-/g, "."), { cik, name, ticker });
    }
  }

  TICKER_CACHE = { byTicker, byName };
  return TICKER_CACHE;
}

function normalizeQuery(raw: string) {
  let q = raw.trim();
  // If it looks like a CIK (all digits, <= 10), return that straight away
  if (/^\d{1,10}$/.test(q)) return { kind: "cik", value: q.padStart(10, "0") as const };

  // Otherwise, normalize ticker variants (BRK.B → BRK.B and BRK-B)
  const upper = q.toUpperCase();
  return { kind: "text", value: upper };
}

async function searchCompanyIndex(q: string) {
  // SEC search index for companies
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
  const j = await r.json().catch(() => ({} as any));
  const hits = j?.hits?.hits || [];
  for (const h of hits) {
    const src = h?._source || {};
    // Many company hits include these fields:
    const cik = (src.cik || src.cikNumber || src.cik_num || "").toString().replace(/\D/g, "");
    const ticker = (src.tickers?.[0] || src.ticker || "").toString().toUpperCase();
    const name = (src.display_names?.[0] || src.display_name || src.entity || src.name || "").toString().trim();
    if (cik && name) {
      return { cik: cik.padStart(10, "0"), name, ticker: ticker || undefined };
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
      return NextResponse.json({
        cik: norm.value,
        name: "Company",
        ticker: undefined,
        from: "cik",
      });
    }

    // 2) Live ticker cache (exact ticker then company name)
    const cache = await loadTickerCache();

    // Exact ticker hit (try both dot and dash variants)
    const tUpper = norm.value;
    const variants = new Set<string>([
      tUpper,
      tUpper.replace(/\./g, "-"),
      tUpper.replace(/-/g, "."),
    ]);
    for (const v of variants) {
      const hit = cache.byTicker.get(v);
      if (hit) {
        return NextResponse.json({ ...hit, from: "ticker" });
      }
    }

    // Try exact company name match
    const byNameArr = cache.byName.get(tUpper);
    if (byNameArr && byNameArr.length) {
      const hit = byNameArr[0];
      return NextResponse.json({ ...hit, from: "name-exact" });
    }

    // 3) Fallback: SEC company search index for fuzzy company name
    const fuzzy = await searchCompanyIndex(raw);
    if (fuzzy) {
      return NextResponse.json({ ...fuzzy, from: "sec-index" });
    }

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