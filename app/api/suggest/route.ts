// app/api/suggest/route.ts
import { NextResponse } from "next/server";

const UA = process.env.SEC_USER_AGENT || "HerevnaBot/1.0 (admin@herevna.io)";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

type Entry = { cik_str: number; ticker: string; title: string };
let cache: { when: number; data: Entry[] } | null = null;

async function loadTickers(): Promise<Entry[]> {
  const now = Date.now();
  if (cache && now - cache.when < 6 * 60 * 60 * 1000) return cache.data; // 6h cache
  const r = await fetch(TICKERS_URL, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC tickers fetch failed (${r.status})`);
  const j = await r.json(); // { "0": {ticker,cik_str,title}, ... }
  const entries: Entry[] = Object.values(j as any);
  cache = { when: now, data: entries };
  return entries;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const limit = Math.min(20, parseInt(searchParams.get("limit") || "10", 10));
    if (!q) return NextResponse.json([]);

    const data = await loadTickers();
    const norm = (s: string) => s.toLowerCase().replace(/[.\- ]/g, "");
    const nq = norm(q);

    // score: exact ticker > startsWith > contains; also name contains
    const scored = data
      .map((e) => {
        const t = norm(e.ticker);
        const name = e.title.toLowerCase();
        let score = -1;
        if (t === nq) score = 100;
        else if (t.startsWith(nq)) score = 75;
        else if (t.includes(nq)) score = 50;
        else if (name.includes(q)) score = 40;
        return { e, score };
      })
      .filter((x) => x.score >= 40)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ e }) => ({
        cik: String(e.cik_str).padStart(10, "0"),
        ticker: e.ticker,
        name: e.title,
      }));

    return NextResponse.json(scored);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Suggest error" }, { status: 500 });
  }
}
