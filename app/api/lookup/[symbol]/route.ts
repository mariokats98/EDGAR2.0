import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

// Fetch SEC master ticker list (once per request; consider caching).
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

type Entry = { cik_str: number; ticker: string; title: string };

export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  const q = decodeURIComponent(params.symbol || "").trim().toUpperCase();
  if (!q) return NextResponse.json({ results: [] });

  const r = await fetch(TICKERS_URL, {
    headers: { "User-Agent": process.env.SEC_USER_AGENT || "Herevna/1.0 (email@example.com)" },
    cache: "no-store"
  });
  const json = await r.json();
  const values: Entry[] = Object.values(json) as any;

  const results = values.filter(v => 
    v.ticker.toUpperCase().includes(q) || v.title.toUpperCase().includes(q)
  ).slice(0, 20).map(v => ({
    cik: String(v.cik_str).padStart(10, "0"),
    ticker: v.ticker.toUpperCase(),
    name: v.title
  }));

  return NextResponse.json({ results });
}
