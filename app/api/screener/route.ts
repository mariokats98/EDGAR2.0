// app/api/screener/route.ts
import { NextResponse } from "next/server";

/**
 * ENV required:
 *  - FMP_API_KEY (FinancialModelingPrep)
 * Optional:
 *  - FINNHUB_API_KEY (for analyst score)
 */

type ScreenerIn = {
  exchange?: string;
  sector?: string;
  priceMin?: number;
  priceMax?: number;
  mcapMin?: number;
  mcapMax?: number;
  volMin?: number;
  changePctMin?: number;
  analystMin?: number;
  page?: number;
  per?: number;
  symbols?: string;
};

type OutRow = {
  symbol: string;
  name?: string;
  exchange?: string;
  sector?: string;
  price?: number;
  changePct?: number;
  volume?: number;
  marketCap?: number;
  analystScore?: number | null;
  analystLabel?: string | null;
};

const MUST_KEY = "Missing FMP_API_KEY (set it in Vercel → Project → Settings → Env Vars).";

function toNum(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function labelFromScore(s: number | null): string | null {
  if (s == null) return null;
  if (s >= 4.5) return "Strong Buy";
  if (s >= 3.5) return "Buy";
  if (s >= 2.5) return "Hold";
  if (s >= 1.5) return "Sell";
  return "Strong Sell";
}

async function fmp(path: string, params: Record<string, any> = {}, cache: RequestCache = "no-store") {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error(MUST_KEY);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  qs.set("apikey", key);
  const url = `https://financialmodelingprep.com/api/v3${path}?${qs.toString()}`;
  const r = await fetch(url, { cache });
  if (!r.ok) throw new Error(`FMP ${path} failed ${r.status}`);
  return r.json();
}

async function finnhub(path: string, params: Record<string, any> = {}) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  qs.set("token", key);
  const r = await fetch(`https://finnhub.io/api/v1${path}?${qs.toString()}`, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

function scoreFromFinnhub(rec: any): number | null {
  if (!rec) return null;
  const b = Number(rec.buy) || 0;
  const h = Number(rec.hold) || 0;
  const s = Number(rec.sell) || 0;
  const sb = Number(rec.strongBuy) || 0;
  const ss = Number(rec.strongSell) || 0;
  const total = b + h + s + sb + ss;
  if (total <= 0) return null;
  const score = (5 * sb + 4 * b + 3 * h + 2 * s + 1 * ss) / total;
  return Math.max(1, Math.min(5, score));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const input: ScreenerIn = {
      exchange: searchParams.get("exchange") || undefined,
      sector: searchParams.get("sector") || undefined,
      priceMin: toNum(searchParams.get("priceMin")),
      priceMax: toNum(searchParams.get("priceMax")),
      mcapMin: toNum(searchParams.get("mcapMin")),
      mcapMax: toNum(searchParams.get("mcapMax")),
      volMin: toNum(searchParams.get("volMin")),
      changePctMin: toNum(searchParams.get("changePctMin")),
      analystMin: toNum(searchParams.get("analystMin")),
      page: Math.max(1, Number(searchParams.get("page") || 1)),
      per: Math.min(100, Math.max(10, Number(searchParams.get("per") || 25))),
      symbols: searchParams.get("symbols") || undefined,
    };

    // 1) Build base universe
    let base: any[] = [];
    if (input.symbols) {
      base = input.symbols
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .map((s) => ({ symbol: s }));
    } else {
      // Use FMP screener; all filters optional
      const params: Record<string, any> = {
        exchange: input.exchange, // "NYSE" | "NASDAQ" | "AMEX"
        sector: input.sector,     // "Technology", etc.
        priceMoreThan: input.priceMin,
        priceLowerThan: input.priceMax,
        marketCapMoreThan: input.mcapMin,
        marketCapLowerThan: input.mcapMax,
        volumeMoreThan: input.volMin,
        limit: 500,
      };
      base = await fmp("/stock-screener", params, "no-store");

      // Fallbacks if empty:
      if (!Array.isArray(base) || base.length === 0) {
        const actives = await fmp("/stock_market/actives", {}, "no-store");
        base = Array.isArray(actives) ? actives.map((a: any) => ({ symbol: a.symbol })) : [];
      }
      if (!Array.isArray(base) || base.length === 0) {
        // Last resort: S&P 500 constituents
        const sp = await fmp("/sp500_constituent", {}, "no-store");
        base = Array.isArray(sp) ? sp.map((row: any) => ({ symbol: row.symbol })) : [];
      }
    }

    // De-dupe
    const universe = Array.from(new Set(base.map((x) => x.symbol).filter(Boolean))).slice(0, 600);
    if (universe.length === 0) {
      return NextResponse.json({ total: 0, page: 1, per: input.per, results: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    // 2) Bulk quotes
    const quotes: Record<string, any> = {};
    const batch = 50;
    for (let i = 0; i < universe.length; i += batch) {
      const group = universe.slice(i, i + batch);
      const q = await fmp(`/quote/${group.join(",")}`, {}, "no-store");
      for (const row of (q || [])) quotes[row.symbol] = row;
    }

    // 3) Optional analyst scores
    const ratings: Record<string, { score: number | null; label: string | null }> = {};
    if (process.env.FINNHUB_API_KEY) {
      // Mild throttle: only first 80 per request
      const subs = universe.slice(0, 80);
      const snaps = await Promise.all(
        subs.map(async (sym) => {
          const arr = await finnhub("/stock/recommendation", { symbol: sym });
          const latest = Array.isArray(arr) && arr.length ? arr[0] : null;
          const score = scoreFromFinnhub(latest);
          return { sym, score, label: labelFromScore(score) };
        })
      );
      for (const r of snaps) ratings[r.sym] = { score: r.score, label: r.label };
    }

    // 4) Compose rows
    let rows: OutRow[] = universe.map((s) => {
      const q = quotes[s] || {};
      const r = ratings[s] || { score: null, label: null };
      const pct = q.changesPercentage ?? q.changePercent ?? q.change ?? 0;
      return {
        symbol: s,
        name: q.name || q.companyName,
        exchange: q.exchange,
        sector: q.sector,
        price: Number(q.price) || Number(q.previousClose) || undefined,
        changePct: Number(pct),
        volume: Number(q.volume) || undefined,
        marketCap: Number(q.marketCap) || undefined,
        analystScore: r.score,
        analystLabel: r.label,
      };
    });

    // 5) Post-filter (client semantics on server for robustness)
    if (input.changePctMin !== undefined) rows = rows.filter((x) => (x.changePct ?? -999) >= input.changePctMin!);
    if (input.analystMin !== undefined) rows = rows.filter((x) => (x.analystScore ?? 0) >= input.analystMin!);

    // Sort by biggest % gainer (default feels alive)
    rows.sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));

    // 6) Pagination
    const total = rows.length;
    const per = input.per ?? 25;
    const page = input.page ?? 1;
    const start = (page - 1) * per;
    const slice = rows.slice(start, start + per);

    return NextResponse.json({ total, page, per, results: slice }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Screener failed" }, { status: 500 });
  }
}
