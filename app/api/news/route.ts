// app/api/news/route.ts
import { NextResponse } from "next/server";

// ---------- Optional tiny cache via Upstash (safe to omit) ----------
async function cacheGet(key: string) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const j = await r.json();
    if (j?.result) return JSON.parse(j.result);
  } catch {}
  return null;
}
async function cacheSet(key: string, value: any, ttlSec = 60) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value: JSON.stringify(value), EX: ttlSec }),
    });
  } catch {}
}

// ---------- Types ----------
type NewsItem = {
  id: string;
  headline: string;
  summary?: string;
  url: string;
  image?: string | null;
  source?: string;
  tickers?: string[];
  published_at: string; // ISO8601
};

function dedupeSort(items: NewsItem[]) {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const key = it.url || it.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  out.sort((a, b) => +new Date(b.published_at) - +new Date(a.published_at));
  return out;
}

// ---------- Providers ----------
async function fromAlphaVantage(params: URLSearchParams): Promise<NewsItem[]> {
  const key = process.env.AV_API_KEY;
  if (!key) return [];
  const qs = new URLSearchParams();
  qs.set("function", "NEWS_SENTIMENT");
  qs.set("apikey", key);
  const tickers = params.get("tickers");
  const q = params.get("q");
  if (tickers) qs.set("tickers", tickers.toUpperCase());
  if (q) qs.set("topics", q);
  const r = await fetch(`https://www.alphavantage.co/query?${qs.toString()}`, { cache: "no-store" });
  if (!r.ok) return [];
  const j = await r.json();
  const arr = j?.feed || [];
  return arr.map((a: any): NewsItem => ({
    id: a.url || a.title,
    headline: a.title,
    summary: a.summary,
    url: a.url,
    image: a.banner_image || null,
    source: a.source,
    tickers: a.ticker_sentiment?.map((t: any) => t.ticker) || [],
    published_at: a.time_published
      ? `${a.time_published.slice(0,4)}-${a.time_published.slice(4,6)}-${a.time_published.slice(6,8)}T${a.time_published.slice(9,11) || "00"}:${a.time_published.slice(11,13) || "00"}:00Z`
      : new Date().toISOString(),
  }));
}

async function fromFinnhub(params: URLSearchParams): Promise<NewsItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  const tickers = params.get("tickers");
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const out: NewsItem[] = [];

  if (tickers) {
    for (const t of tickers.split(",").map(s => s.trim()).filter(Boolean)) {
      const qs = new URLSearchParams({ symbol: t.toUpperCase(), from, to });
      const r = await fetch(`https://finnhub.io/api/v1/company-news?${qs.toString()}&token=${key}`, { cache: "no-store" });
      if (!r.ok) continue;
      const arr = await r.json();
      for (const a of arr) {
        out.push({
          id: a.id ? String(a.id) : a.url,
          headline: a.headline,
          summary: a.summary,
          url: a.url,
          image: a.image || null,
          source: a.source || "Finnhub",
          tickers: [t.toUpperCase()],
          published_at: a.datetime ? new Date(a.datetime * 1000).toISOString() : new Date().toISOString(),
        });
      }
    }
  } else {
    const r = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${key}`, { cache: "no-store" });
    if (!r.ok) return out;
    const arr = await r.json();
    for (const a of arr) {
      out.push({
        id: a.id ? String(a.id) : a.url,
        headline: a.headline,
        summary: a.summary,
        url: a.url,
        image: a.image || null,
        source: a.source || "Finnhub",
        tickers: [],
        published_at: a.datetime ? new Date(a.datetime * 1000).toISOString() : new Date().toISOString(),
      });
    }
  }
  return out;
}

async function fromFMP(params: URLSearchParams): Promise<NewsItem[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) return [];
  const tickers = params.get("tickers");
  const from = params.get("from");
  const to = params.get("to");
  const qs = new URLSearchParams();
  if (tickers) qs.set("tickers", tickers.toUpperCase());
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  qs.set("limit", "100");
  qs.set("apikey", key);
  const r = await fetch(`https://financialmodelingprep.com/api/v3/stock_news?${qs.toString()}`, { cache: "no-store" });
  if (!r.ok) return [];
  const arr = await r.json();
  return (arr || []).map((a: any): NewsItem => ({
    id: a.url,
    headline: a.title,
    summary: a.text,
    url: a.url,
    image: a.image || null,
    source: a.site || "FMP",
    tickers: (a.symbol || "").split(",").map((s: string) => s.trim()).filter(Boolean),
    published_at: a.publishedDate ? new Date(a.publishedDate).toISOString() : new Date().toISOString(),
  }));
}

// ---------- Handler ----------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const per = Math.min(50, Math.max(5, parseInt(searchParams.get("per") || "10")));
    const tickers = searchParams.get("tickers") || ""; // "AAPL,MSFT"
    const q = searchParams.get("q") || "";             // keyword
    const from = searchParams.get("from") || "";       // YYYY-MM-DD
    const to = searchParams.get("to") || "";           // YYYY-MM-DD

    const ck = `news:v1:${tickers}:${q}:${from}:${to}`;
    const cached = await cacheGet(ck);
    if (cached) {
      const start = (page - 1) * per;
      return NextResponse.json({ total: cached.length, page, per, results: cached.slice(start, start + per) }, { headers: { "Cache-Control": "no-store" }});
    }

    const params = new URLSearchParams({ tickers, q, from, to });
    const [av, fh, fmp] = await Promise.allSettled([
      fromAlphaVantage(params),
      fromFinnhub(params),
      fromFMP(params),
    ]);

    const all: NewsItem[] = [
      ...(av.status === "fulfilled" ? av.value : []),
      ...(fh.status === "fulfilled" ? fh.value : []),
      ...(fmp.status === "fulfilled" ? fmp.value : []),
    ];

    const normalized = dedupeSort(all);
    await cacheSet(ck, normalized, 60);

    const start = (page - 1) * per;
    return NextResponse.json({
      total: normalized.length,
      page,
      per,
      results: normalized.slice(start, start + per),
    }, { headers: { "Cache-Control": "no-store" }});
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "News fetch failed" }, { status: 500 });
  }
}
