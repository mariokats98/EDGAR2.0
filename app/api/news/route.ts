// app/api/news/route.ts
import { NextResponse } from "next/server";

/* ---------------- Types ---------------- */
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

/* --------------- Spam / low-value filters --------------- */
// Headlines/summaries containing any of these will be dropped.
const DEFAULT_EXCLUDE_PHRASES = [
  "class action", "shareholder alert", "shareholders alert",
  "securities fraud", "investigation announced", "investigation of", "law firm",
  "rosen law firm", "glancy prongay", "pomerantz", "faruqi & faruqi",
  "hagens berman", "bragar eagel", "bernstein liebhard", "levi & korsinsky",
  "gross law firm", "jakubowitz", "schall law", "kaskela",
];

// If you want to block entire sources by name (case-insensitive), add them here:
const DEFAULT_BLOCKED_SOURCES = [
  // "benzinga",   // ← uncomment to block all Benzinga outright
];

/* --------------- Category keywords (optional) --------------- */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  earnings: [
    "earnings", "results", "eps", "revenue", "guidance", "outlook",
    "beat", "miss", "dividend", "buyback"
  ],
  mna: [
    "merger", "acquisition", "acquire", "takeover", "buyout", "deal",
    "go private", "lbo", "all-cash", "all cash", "tender offer", "spac"
  ],
  filings: [
    "sec filing", "10-k", "10-q", "8-k", "s-1", "424b", "13d", "13g", "6-k", "20-f", "prospectus"
  ],
  macro: [
    "cpi", "inflation", "jobs", "unemployment", "payrolls", "gdp", "fed", "fomc", "pce",
    "ism", "pmi", "retail sales", "housing starts"
  ],
  themes: [
    "ai", "artificial intelligence", "semiconductor", "chip", "gpu", "cloud",
    "data center", "foundry", "llm"
  ],
};

function matchCategory(n: NewsItem, cat?: string) {
  if (!cat) return true;
  const keys = CATEGORY_KEYWORDS[cat];
  if (!keys) return true;
  const hay = `${n.headline || ""} ${n.summary || ""}`.toLowerCase();
  return keys.some(k => hay.includes(k.toLowerCase()));
}

/* --------------- Helpers --------------- */
function dedupeSort(items: NewsItem[]) {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const key = (it.url || it.id || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  out.sort((a, b) => +new Date(b.published_at) - +new Date(a.published_at));
  return out;
}

function passesSourceFilter(source: string | undefined, allowList: string[], blockList: string[]) {
  const s = (source || "").toLowerCase();
  if (blockList.length && blockList.some(b => s.includes(b))) return false;
  if (allowList.length && !allowList.some(a => s.includes(a))) return false;
  return true;
}

function passesContentFilter(n: NewsItem, excludeWords: string[]) {
  const hay = `${n.headline || ""} ${n.summary || ""}`.toLowerCase();
  return !excludeWords.some(w => hay.includes(w));
}

/* --------------- Providers --------------- */
// Alpha Vantage
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
    source: a.source || "AlphaVantage",
    tickers: a.ticker_sentiment?.map((t: any) => t.ticker) || [],
    published_at: a.time_published
      ? `${a.time_published.slice(0,4)}-${a.time_published.slice(4,6)}-${a.time_published.slice(6,8)}T${a.time_published.slice(9,11) || "00"}:${a.time_published.slice(11,13) || "00"}:00Z`
      : new Date().toISOString(),
  }));
}

// Finnhub
async function fromFinnhub(params: URLSearchParams): Promise<NewsItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  const tickers = params.get("tickers");
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const out: NewsItem[] = [];

  if (tickers) {
    for (const t of tickers.split(",").map(s => s.trim()).filter(Boolean)) {
      const qs = new URLSearchParams({ symbol: t.toUpperCase() });
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
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

// FMP
async function fromFMP(params: URLSearchParams): Promise<NewsItem[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) return [];
  const tickers = params.get("tickers");
  const from = params.get("from") || "";
  const to = params.get("to") || "";
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

/* --------------- Handler --------------- */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const per = Math.min(50, Math.max(5, parseInt(searchParams.get("per") || "10")));
    const tickers = searchParams.get("tickers") || "";
    const q = searchParams.get("q") || "";
    const category = searchParams.get("category") || ""; // earnings|mna|filings|macro|themes
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";

    // Optional overrides: sources=wsj,bloomberg  blockedSources=benzinga
    const allowSources = (searchParams.get("sources") || "")
      .toLowerCase()
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const blockedSources = [
      ...DEFAULT_BLOCKED_SOURCES,
      ...(searchParams.get("blockedSources") || "")
        .toLowerCase()
        .split(",")
        .map(s => s.trim())
        .filter(Boolean),
    ];
    const excludeWords = [
      ...DEFAULT_EXCLUDE_PHRASES,
      ...(searchParams.get("excludeWords") || "")
        .toLowerCase()
        .split(",")
        .map(s => s.trim())
        .filter(Boolean),
    ];

    const params = new URLSearchParams({ tickers, q, category, from, to });

    // Fetch from providers in parallel
    const [avRes, fhRes, fmpRes] = await Promise.allSettled([
      fromAlphaVantage(params),
      fromFinnhub(params),
      fromFMP(params),
    ]);

    let all: NewsItem[] = [];
    if (avRes.status === "fulfilled") all = all.concat(avRes.value);
    if (fhRes.status === "fulfilled") all = all.concat(fhRes.value);
    if (fmpRes.status === "fulfilled") all = all.concat(fmpRes.value);

    // Category filter (server)
    if (category) {
      all = all.filter(n => matchCategory(n, category));
    }

    // Source allow/block + content spam filter
    all = all.filter(n =>
      passesSourceFilter(n.source, allowSources, blockedSources) && passesContentFilter(n, excludeWords)
    );

    // Optional free-text q applied after mapping
    if (q) {
      const qq = q.toLowerCase();
      all = all.filter(n =>
        (n.headline || "").toLowerCase().includes(qq) ||
        (n.summary || "").toLowerCase().includes(qq)
      );
    }

    const normalized = dedupeSort(all);
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
