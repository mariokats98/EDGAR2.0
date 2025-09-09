// app/api/suggest/route.ts
import { NextResponse } from "next/server";

const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const UA = process.env.SEC_USER_AGENT || "Herevna/1.0 (contact@herevna.io)";

type Row = { cik: string; ticker: string; name: string };

let CACHE: { loadedAt: number; rows: Row[] } | null = null;

async function loadSecList(): Promise<Row[]> {
  if (CACHE && Date.now() - CACHE.loadedAt < 24 * 60 * 60 * 1000) return CACHE.rows;

  const r = await fetch(SEC_TICKERS_URL, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC tickers download failed: ${r.status}`);
  const j = await r.json();
  const rows: Row[] = Object.values(j as any).map((x: any) => ({
    cik: String(x.cik_str).padStart(10, "0"),
    ticker: String(x.ticker || "").toUpperCase(),
    name: String(x.title || ""),
  }));
  CACHE = { loadedAt: Date.now(), rows };
  return rows;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") || "").trim();
  if (!qRaw) return NextResponse.json([]);

  const q = qRaw.toUpperCase();
  const rows = await loadSecList();

  // For tickers: startsWith; for names: includes
  const out = rows
    .filter(
      (r) => r.ticker.startsWith(q) || r.name.toUpperCase().includes(q)
    )
    .slice(0, 10);

  return NextResponse.json(out);
}