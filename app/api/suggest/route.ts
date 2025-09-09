import { NextRequest, NextResponse } from "next/server";

/**
 * Loads the official SEC company_tickers.json once (per runtime) and searches it.
 * Shape is: { "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }, ... }
 */
let cache: { cik: string; ticker?: string; title: string }[] | null = null;
let lastLoad = 0;

async function loadIndex(): Promise<typeof cache> {
  const now = Date.now();
  if (cache && now - lastLoad < 1000 * 60 * 60) return cache; // 1h cache

  const url = "https://www.sec.gov/files/company_tickers.json";
  const r = await fetch(url, {
    headers: {
      "User-Agent": process.env.SEC_USER_AGENT || "herevna.io contact@herevna.io",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC tickers fetch failed (${r.status})`);
  const j = await r.json();
  const out: { cik: string; ticker?: string; title: string }[] = [];
  for (const k of Object.keys(j)) {
    const row = j[k];
    const cik = String(row.cik_str).padStart(10, "0");
    const ticker = row.ticker ? String(row.ticker).toUpperCase() : undefined;
    const title = String(row.title || "").trim();
    out.push({ cik, ticker, title });
  }
  cache = out;
  lastLoad = now;
  return cache;
}

function fuzzIncl(a: string, b: string) {
  return a.toLowerCase().includes(b.toLowerCase());
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    if (!q) return NextResponse.json({ data: [] });

    const list = await loadIndex();

    // if exact ticker match first
    const upper = q.toUpperCase();
    const exactTicker = list.filter(x => x.ticker === upper);

    // otherwise loose search in ticker/title
    const loose = list.filter(
      x => (x.ticker && fuzzIncl(x.ticker, q)) || fuzzIncl(x.title, q)
    );

    // de-dupe, prioritize exact tickers
    const seen = new Set<string>();
    const data: { cik: string; ticker?: string; title: string }[] = [];
    for (const row of [...exactTicker, ...loose]) {
      const key = `${row.cik}-${row.ticker ?? row.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      data.push(row);
      if (data.length >= 30) break;
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error", data: [] }, { status: 200 });
  }
}