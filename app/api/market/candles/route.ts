// app/api/market/candles/route.ts
import { NextResponse } from "next/server";

// Normalized response shape
type Point = { t: number; c: number };

function j(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return j({ error: message }, { status });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase();
  const range = (searchParams.get("range") || "3M").toUpperCase(); // 1M|3M|6M|1Y|5Y
  if (!symbol) return err("Missing symbol");

  // Pick sensible from/to by range
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  const ranges: Record<string, number> = {
    "1M": 30 * day,
    "3M": 90 * day,
    "6M": 180 * day,
    "1Y": 365 * day,
    "5Y": 1825 * day,
  };
  const span = ranges[range] || ranges["3M"];
  const from = now - span;
  const to = now;

  // Try Finnhub first (if key present)
  const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
  if (FINNHUB_API_KEY) {
    // pick finnhub resolution based on range
    const res = range === "1M" ? "60" : range === "3M" ? "D" : "D";
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(
      symbol
    )}&resolution=${res}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
    const r = await fetch(url, { cache: "no-store" });
    if (r.ok) {
      const data = (await r.json()) as any;
      if (data.s === "ok" && Array.isArray(data.t) && Array.isArray(data.c)) {
        const points: Point[] = data.t.map((t: number, i: number) => ({ t: t * 1000, c: data.c[i] }));
        return j({ symbol, source: "finnhub", points });
      }
    }
  }

  // Fallback to FMP historical line (no key => demo)
  const FMP_API_KEY = process.env.FMP_API_KEY || "demo";
  // timeseries param is max points; just pick an upper bound for each range
  const ts = range === "1M" ? 35 : range === "3M" ? 110 : range === "6M" ? 210 : range === "1Y" ? 420 : 1500;
  const fmpUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(
    symbol
  )}?serietype=line&timeseries=${ts}&apikey=${FMP_API_KEY}`;
  const r2 = await fetch(fmpUrl, { cache: "no-store" });
  if (!r2.ok) return err(`Candles fetch failed (${r2.status})`, 500);
  const j2 = (await r2.json()) as any;
  const list = j2?.historical || [];
  const points: Point[] = list
    .map((row: any) => ({ t: new Date(row.date).getTime(), c: Number(row.close) }))
    .filter((p: Point) => Number.isFinite(p.c))
    .sort((a: Point, b: Point) => a.t - b.t);

  return j({ symbol, source: "fmp", points });
}