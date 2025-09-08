// app/api/suggest/route.ts
import { NextResponse } from "next/server";

const UA =
  process.env.SEC_USER_AGENT ||
  "Herevna/1.0 (contact@herevna.io)";

let TICKER_CACHE: null | Array<{ cik: string; ticker: string; name: string }> = null;

async function loadList() {
  if (TICKER_CACHE) return TICKER_CACHE;
  const url = "https://www.sec.gov/files/company_tickers.json";
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC tickers fetch failed (${r.status})`);
  const j = await r.json();
  const out: Array<{ cik: string; ticker: string; name: string }> = [];
  for (const k of Object.keys(j)) {
    const row = j[k];
    if (!row) continue;
    out.push({
      cik: String(row.cik_str).padStart(10, "0"),
      ticker: String(row.ticker || "").toUpperCase(),
      name: String(row.title || "").trim(),
    });
  }
  TICKER_CACHE = out;
  return out;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toUpperCase();
    if (!q || q.length < 1) return NextResponse.json({ suggestions: [] });

    const list = await loadList();

    // Simple prefix match on ticker or company name
    const starts = list.filter(
      (r) =>
        r.ticker.startsWith(q) ||
        r.name.toUpperCase().startsWith(q)
    );

    // If too few, add contains matches (but avoid duplicates)
    let results = starts.slice(0, 30);
    if (results.length < 10) {
      const seen = new Set(results.map((r) => r.cik));
      for (const r of list) {
        if (seen.has(r.cik)) continue;
        if (
          r.ticker.includes(q) ||
          r.name.toUpperCase().includes(q)
        ) {
          results.push(r);
          seen.add(r.cik);
          if (results.length >= 30) break;
        }
      }
    }

    const suggestions = results.map((r) => ({
      label: `${r.ticker} • ${r.name}`,
      value: r.ticker,
      cik: r.cik,
    }));

    return NextResponse.json({ suggestions });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error", suggestions: [] },
      { status: 500 }
    );
  }
}