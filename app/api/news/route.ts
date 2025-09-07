import { NextResponse } from "next/server";

type NewsItem = {
  id: string;
  headline: string;
  summary?: string;
  url: string;
  image?: string | null;
  source?: string;
  tickers?: string[];
  published_at: string;
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const per = Math.min(50, Math.max(5, parseInt(searchParams.get("per") || "10")));
    const tickers = searchParams.get("tickers") || "";
    const q = searchParams.get("q") || "";

    const params = new URLSearchParams({ tickers, q });
    const av = await fromAlphaVantage(params);
    const all = dedupeSort(av);

    const start = (page - 1) * per;
    return NextResponse.json({
      total: all.length,
      page,
      per,
      results: all.slice(start, start + per),
    }, { headers: { "Cache-Control": "no-store" }});
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "News fetch failed" }, { status: 500 });
  }
}
