import { NextResponse } from "next/server";

type Row = {
  symbol: string;
  name: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  price?: number;
  marketCap?: number;
  pe?: number;
  dividendYield?: number;
};

function j(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return j({ error: message }, { status });
}

// helpers
const toInt = (v: string | null, def: number) => {
  const n = v ? parseInt(v, 10) : def;
  return Number.isFinite(n) && n > 0 ? n : def;
};
const toNum = (v: string | null) => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // filters
    const exchange = (searchParams.get("exchange") || "").trim();
    const sector = (searchParams.get("sector") || "").trim();
    const search = (searchParams.get("search") || "").trim();

    const marketCapMin = toNum(searchParams.get("marketCapMin"));
    const marketCapMax = toNum(searchParams.get("marketCapMax"));
    const peMin = toNum(searchParams.get("peMin"));
    const peMax = toNum(searchParams.get("peMax"));
    const dividendMin = toNum(searchParams.get("dividendMin"));
    const dividendMax = toNum(searchParams.get("dividendMax"));

    const limit = toInt(searchParams.get("limit"), 50);
    const page = toInt(searchParams.get("page"), 1);
    const sortRaw = (searchParams.get("sort") || "marketCap,desc").trim();

    // sort parsing
    const [sortKey, sortDirRaw] = sortRaw.split(",").map((s) => s.trim());
    const sortDir: "asc" | "desc" = sortDirRaw === "asc" ? "asc" : "desc";
    const sortable = new Set(["marketCap", "price", "pe", "dividendYield"]);
    const key = sortable.has(sortKey) ? sortKey : "marketCap";

    // Build FMP request safely
    const FMP_API_KEY = process.env.FMP_API_KEY || "demo";
    const fmp = new URL("https://financialmodelingprep.com/api/v3/stock-screener");

    // We’ll request more than we need and paginate locally for stability
    // (FMP screener doesn’t support page/offset)
    const API_LIMIT = Math.max(limit * 4, 200);
    fmp.searchParams.set("limit", String(API_LIMIT));
    fmp.searchParams.set("country", "US"); // constrain to US for cleaner results
    fmp.searchParams.set("apikey", FMP_API_KEY);

    if (exchange) fmp.searchParams.set("exchange", exchange);
    if (sector) fmp.searchParams.set("sector", sector);

    if (marketCapMin !== undefined) fmp.searchParams.set("marketCapMoreThan", String(marketCapMin));
    if (marketCapMax !== undefined) fmp.searchParams.set("marketCapLowerThan", String(marketCapMax));
    if (peMin !== undefined) fmp.searchParams.set("peMoreThan", String(peMin));
    if (peMax !== undefined) fmp.searchParams.set("peLowerThan", String(peMax));
    if (dividendMin !== undefined) fmp.searchParams.set("dividendMoreThan", String(dividendMin));
    if (dividendMax !== undefined) fmp.searchParams.set("dividendLowerThan", String(dividendMax));

    // Fetch
    const r = await fetch(fmp.toString(), { cache: "no-store" });
    if (!r.ok) return err(`Screener fetch failed (${r.status})`, 502);
    const raw = (await r.json()) as any[];

    // Map to normalized rows
    let rows: Row[] = (raw || []).map((x) => ({
      symbol: x.symbol,
      name: x.companyName || x.company || x.name || x.symbol,
      exchange: x.exchange || x.exchangeShortName,
      sector: x.sector,
      industry: x.industry,
      price: typeof x.price === "number" ? x.price : undefined,
      marketCap: typeof x.marketCap === "number" ? x.marketCap : undefined,
      pe: typeof x.pe === "number" ? x.pe : undefined,
      dividendYield:
        typeof x.lastDiv === "number" && typeof x.price === "number" && x.price > 0
          ? (x.lastDiv / x.price) * 100
          : typeof x.dividendYield === "number"
          ? x.dividendYield
          : undefined,
    }));

    // Apply text search (symbol or name contains)
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.symbol?.toLowerCase().includes(s) ||
          r.name?.toLowerCase().includes(s)
      );
    }

    // Sort
    rows.sort((a, b) => {
      const av = (a as any)[key] ?? -Infinity;
      const bv = (b as any)[key] ?? -Infinity;
      if (av === bv) return 0;
      return sortDir === "asc" ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
    });

    // Paginate locally
    const start = (page - 1) * limit;
    const end = start + limit;
    const slice = rows.slice(start, end);
    const nextPage = end < rows.length ? page + 1 : null;

    return j({
      data: slice,
      page,
      nextPage,
      limit,
      total: rows.length,
    });
  } catch (e: any) {
    // This also catches malformed URL issues and returns a clean error
    return err(e?.message || "Unexpected server error", 500);
  }
}