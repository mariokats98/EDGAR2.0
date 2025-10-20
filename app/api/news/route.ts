// app/api/news/route.ts
import { NextResponse } from "next/server";

type Article = {
  id?: string;
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  tickers?: string[];
  summary?: string;
};

// --- Configuration -----------------------------------------------------------

// Block sources by *name* (case-insensitive)
const DEFAULT_BLOCKED_SOURCES: string[] = [
  // "benzinga",
];

// Block by ticker symbol (UPPERCASE)
const DEFAULT_BLOCKED_TICKERS: string[] = [
  // "GME",
  // "AMC",
];

// Example: how many items to keep by default
const DEFAULT_LIMIT = 50;

// --- Helpers ----------------------------------------------------------------

function normalizeSource(name?: string) {
  return (name ?? "").trim().toLowerCase();
}

function isBlockedSource(name?: string) {
  const n = normalizeSource(name);
  return n.length > 0 && DEFAULT_BLOCKED_SOURCES.some(s => normalizeSource(s) === n);
}

function isBlockedByTicker(tickers?: string[]) {
  if (!tickers?.length) return false;
  const set = new Set(DEFAULT_BLOCKED_TICKERS.map(t => t.toUpperCase()));
  return tickers.some(t => set.has((t ?? "").toUpperCase()));
}

// --- GET handler -------------------------------------------------------------

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.max(1, Math.min(Number(limitRaw) || DEFAULT_LIMIT, 200));

    // TODO: Replace this with your real news source fetch
    // For now, pretend we fetched an array of Article-like objects
    const fetched: Article[] = await fetchNews();

    const filtered = fetched.filter(a => {
      if (isBlockedSource(a.source)) return false;
      if (isBlockedByTicker(a.tickers)) return false;
      return true;
    });

    return NextResponse.json(filtered.slice(0, limit));
  } catch (err) {
    console.error("News route error:", err);
    return NextResponse.json({ error: "Failed to load news" }, { status: 500 });
  }
}

// Mock fetcher — replace with your real implementation
async function fetchNews(): Promise<Article[]> {
  // Example static items; wire up your real feed(s) here.
  return [
    {
      id: "demo-1",
      title: "Market opens mixed as investors eye earnings",
      url: "https://example.com/news/1",
      source: "examplewire",
      publishedAt: new Date().toISOString(),
      tickers: ["AAPL", "MSFT"],
      summary: "Stocks were mixed at the open...",
    },
  ];
}

export const dynamic = "force-dynamic";