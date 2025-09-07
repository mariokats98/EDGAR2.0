// app/api/screener/route.ts
import { NextResponse } from "next/server";

type ScreenerIn = {
  exchange?: string;
  sector?: string;
  priceMin?: number;
  priceMax?: number;
  mcapMin?: number;
  mcapMax?: number;
  volMin?: number;
  changePctMin?: number;
  analystMin?: number; // 1..5
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
  change?: number;
  changePct?: number;
  volume?: number;
  marketCap?: number;
  analystScore?: number | null;
  analystLabel?: string | null;
};

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

async function fmpFetch(path: string, params: Record<string,string | number | undefined> = {}, cache: RequestCache = "no-store") {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("Missing FMP_API_KEY");
  const qs = new URLSearchParams();
  for (const [k,v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  qs.set("apikey", key);
  const r = await fetch(`https://financialmodelingprep.com/api/v3${path}?${qs.toString()}`, { cache });
  if (!r.ok) throw new Error(`FMP ${path} failed ${r.status}`);
  return r.json();
}

async function finnhubFetch(path: string, params: Record<string,string | number | undefined> = {}) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const qs = new URLSearchParams();
  for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  qs.set("token", key);
  const r = await fetch(`https://finnhub.io/api/v1${path}?${qs.toString()}`, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

// Weighted 1..5 score from Finnhub recommendation snapshot
function scoreFromFinnhub(rec: any): number | null {
  if (!rec) return null;
  const b  = Number(rec.buy) || 0;
  const h  = Number(rec.hold) || 0;
  const s  = Number(rec.sell) || 0;
  const sb = Number(rec.strongBuy) || 0;
  const ss = Number(rec.strongSell) || 0;
  const total = b + h + s + sb + ss;
  if (total <= 0) return null;
  const score = (5*sb + 4*b + 3*h + 2*s + 1*ss) / total;
  return Math.max(1, Math.min(5, score));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const input: ScreenerIn = {
      exchange:   searchParams.get("exchange") || undefined,
      sector:     searchParams.get("sector") || undefined,
      priceMin:   toNum(searchParams.get("priceMin")),
      priceMax:   toNum(searchParams.get("priceMax")),
      mcapMin:    toNum(searchParams.get("mcapMin")),
      mcapMax:    toNum(searchParams.get("mcapMax")),
      volMin:     toNum(searchParams.get("volMin")),
      changePctMin: toNum(searchParams.get("changePctMin")),
      analystMin: toNum(searchParams.get("analystMin")),
      page:       Math.max(1, Number(searchParams.get("page") || 1)),
      per:        Math.min(100, Math.max(10, Number(searchParams.get("per") || 25))),
      symbols:    searchParams.get("symbols") || undefined,
    };

    // 1) Base universe
    let base: any[] = [];
    if (input.symbols) {
      base = input.symbols.split(",").map(s => s.trim()).filter(Boolean).map(s => ({ symbol: s }));
    } else {
      // FMP stock screener — all filters optional
      const screenerParams: Record<string, string | number | undefined> = {
        exchange: input.exchange, // "NASDAQ" | "NYSE" | "AMEX"
        sector: input.sector,     // e.g., "Technology"
        priceMoreThan: input.priceMin,
        priceLowerThan: input.priceMax,
        marketCapMoreThan: input.mcapMin,
        marketCapLowerThan: input.mcapMax,
        volumeMoreThan: input.volMin,
        limit: 500,
      };
      base = await fmpFetch("/stock-screener", screenerParams);
      // Fallback to “most actives” if screen is empty
      if (!Array.isArray(base) || base.length === 0) {
        const actives = await fmpFetch("/stock_market/actives");
        base = Array.isArray(actives) ? actives.map((a) => ({ symbol: a.symbol })) : [];
      }
    }

    // Dedupe symbol list
    const symbols = Array.from(new Set(base.map((x) => x.symbol).filter(Boolean)));

    // 2) Quotes
    const quotes: Record<string, any> = {};
    const chunks: string[][] = [];
    const _symbols = [...symbols];
    while (_symbols.length) chunks.push(_symbols.splice(0, 50));
    for (const c of chunks) {
      const data = await fmpFetch(`/quote/${c.join(",")}`, {}, "no-store");
      for (const q of (data || [])) quotes[q.symbol] = q;
    }

    // 3) Analyst ratings (optional)
    const ratings: Record<string, {score: number|null, label: string|null}> = {};
    if (process.env.FINNHUB_API_KEY) {
      const slice = symbols.slice(0, 60); // rate-limit friendly
      const recs = await Promise.all(slice.map(async (sym) => {
        const arr = await finnhubFetch("/stock/recommendation", { symbol: sym });
        const latest = Array.isArray(arr) && arr.length ? arr[0] : null;
        const score = scoreFromFinnhub(latest);
        return { sym, score, label: labelFromScore(score) };
      }));
      for (const r of recs) ratings[r.sym] = { score: r.score, label: r.label };
    }

    // 4) Compose + optional filters client-side
    let out: OutRow[] = symbols.map((s) => {
      const q = quotes[s] || {};
      const r = ratings[s] || { score: null, label: null };
      return {
        symbol: s,
        name: q.name || q.companyName,
        exchange: q.exchange,
        sector: q.sector,
        price: Number(q.price) || Number(q.previousClose) || undefined,
        change: Number(q.change) || undefined,
        changePct: Number(q.changesPercentage) || Number(q.changes) || undefined,
        volume: Number(q.volume) || undefined,
        marketCap: Number(q.marketCap) || undefined,
        analystScore: r.score,
        analystLabel: r.label,
      };
    });

    if (input.changePctMin !== undefined) {
      out = out.filter(x => (x.changePct ?? -999) >= input.changePctMin!);
    }
    if (input.analystMin !== undefined) {
      out = out.filter(x => (x.analystScore ?? 0) >= input.analystMin!);
    }

    // 5) Sort by biggest % gainer
    out.sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));

    // 6) Pagination
    const total = out.length;
    const start = (input.page! - 1) * input.per!;
    const pageRows = out.slice(start, start + input.per!);

    return NextResponse.json({ total, page: input.page, per: input.per, results: pageRows }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Screener failed" }, { status: 500 });
  }
}
