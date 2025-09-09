// app/api/suggest/route.ts
import { NextResponse } from "next/server";

type SecTickerRow = {
  cik_str: number;
  ticker: string;
  title: string;
};

const SEC_TICKERS_URL =
  "https://www.sec.gov/files/company_tickers.json"; // official master list

// cache in serverless instance
let _cache: { when: number; list: SecTickerRow[] } | null = null;

async function loadTickers(): Promise<SecTickerRow[]> {
  const now = Date.now();
  if (_cache && now - _cache.when < 1000 * 60 * 60) {
    return _cache.list;
  }
  const ua = process.env.SEC_USER_AGENT || "herevna.io contact@herevna.io";
  const r = await fetch(SEC_TICKERS_URL, {
    headers: { "User-Agent": ua, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`SEC tickers fetch failed (${r.status})`);
  }
  const j = (await r.json()) as Record<string, SecTickerRow>;
  const list = Object.values(j);
  _cache = { when: now, list };
  return list;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return NextResponse.json({ data: [] });

    const list = await loadTickers();
    const needle = q.toLowerCase();

    // rank simple: startsWith > includes
    const ranked = list
      .map((row) => ({
        ...row,
        cik: String(row.cik_str).padStart(10, "0"),
        score:
          row.ticker.toLowerCase().startsWith(needle) ||
          row.title.toLowerCase().startsWith(needle)
            ? 2
            : row.ticker.toLowerCase().includes(needle) ||
              row.title.toLowerCase().includes(needle)
            ? 1
            : 0,
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, 12)
      .map(({ cik, ticker, title }) => ({ cik, ticker, title }));

    return NextResponse.json({ data: ranked });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Suggest failed" }, { status: 500 });
  }
}