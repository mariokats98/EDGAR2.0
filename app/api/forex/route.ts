// app/api/forex/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_API_KEY = process.env.FMP_API_KEY || "";

type FxQuote = {
  symbol: string;      // e.g., "EURUSD"
  name?: string;       // e.g., "Euro / US Dollar"
  price?: number;
  changesPercentage?: number;
  change?: number;
  dayLow?: number;
  dayHigh?: number;
  yearLow?: number;
  yearHigh?: number;
  timestamp?: number;
  bid?: number;
  ask?: number;
};

function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return json({ ok: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    if (!FMP_API_KEY) return err("Missing FMP_API_KEY", 500);

    const { searchParams } = new URL(req.url);
    // Optional: limit to certain symbols, comma-separated (e.g. "EURUSD,USDJPY")
    const symbols = (searchParams.get("symbols") || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const url = new URL("https://financialmodelingprep.com/api/v3/quotes/forex");
    url.searchParams.set("apikey", FMP_API_KEY);

    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) throw new Error(`FMP quotes failed ${r.status}`);
    const data = (await r.json()) as FxQuote[];

    const rows = Array.isArray(data) ? data : [];
    const filtered = symbols.length
      ? rows.filter((q) => symbols.includes(q.symbol?.toUpperCase() || ""))
      : rows;

    return json({ ok: true, rows: filtered, count: filtered.length });
  } catch (e: any) {
    return err(e?.message || "Unexpected error", 500);
  }
}