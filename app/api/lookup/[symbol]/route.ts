// app/api/lookup/[symbol]/route.ts
import { NextResponse } from "next/server";

const SEC_HEADERS = {
  "User-Agent": process.env.SEC_USER_AGENT || "Herevna/1.0 (contact@example.com)",
  "Accept": "application/json",
};

type TickerRow = { cik_str: number; ticker: string; title: string };

let CACHE: { rows: TickerRow[]; at: number } | null = null;
const TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

async function loadTickers(): Promise<TickerRow[]> {
  if (CACHE && Date.now() - CACHE.at < TTL_MS) return CACHE.rows;
  const url = "https://www.sec.gov/files/company_tickers.json";
  const r = await fetch(url, { headers: SEC_HEADERS, cache: "no-store" });
  if (!r.ok) throw new Error(`SEC tickers fetch failed: ${r.status}`);
  const j = await r.json();
  // file is an object keyed by index; normalize to array
  const rows: TickerRow[] = Object.values(j).map((o: any) => ({
    cik_str: Number(o.cik_str),
    ticker: String(o.ticker || "").toUpperCase(),
    title: String(o.title || ""),
  }));
  CACHE = { rows, at: Date.now() };
  return rows;
}

export async function GET(
  req: Request,
  { params }: { params: { symbol: string } }
) {
  try {
    const qRaw = (params.symbol || "").trim();
    const q = qRaw.toUpperCase();
    if (!q) return NextResponse.json({ data: [] });

    const rows = await loadTickers();

    // If exact ticker, prioritize it first
    const exact = rows.filter((r) => r.ticker === q);

    // Loose contains match (title or ticker)
    const needle = qRaw.toLowerCase();
    const loose = rows.filter(
      (r) =>
        r.ticker.includes(q) ||
        r.title.toLowerCase().includes(needle)
    );

    // unique by CIK
    const picked: Record<number, TickerRow> = {};
    [...exact, ...loose].forEach((r) => (picked[r.cik_str] = r));
    const out = Object.values(picked).slice(0, 20); // cap

    return NextResponse.json({
      data: out.map((r) => ({
        cik: String(r.cik_str).padStart(10, "0"),
        ticker: r.ticker,
        name: r.title,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Lookup failed" }, { status: 500 });
  }
}