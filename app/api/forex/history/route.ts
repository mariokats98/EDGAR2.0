// app/api/forex/history/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_API_KEY = process.env.FMP_API_KEY || "";

type Bar = {
  date: string;     // "2024-09-12 15:00:00"
  open: number;
  high: number;
  low: number;
  close: number;
};

function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return json({ ok: false, error: message }, { status });
}

// Allowed intervals that FMP supports for /historical-chart
const ALLOWED = new Set(["1min", "5min", "15min", "30min", "1hour", "4hour"]);

export async function GET(req: NextRequest) {
  try {
    if (!FMP_API_KEY) return err("Missing FMP_API_KEY", 500);

    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase().trim(); // e.g., EURUSD
    const interval = (searchParams.get("interval") || "1hour").toLowerCase();
    const limit = Math.min(1000, Math.max(10, Number(searchParams.get("limit") || "300")));

    if (!symbol) return err("symbol required", 400);
    if (!ALLOWED.has(interval)) return err(`interval must be one of ${Array.from(ALLOWED).join(", ")}`, 400);

    const url = new URL(
      `https://financialmodelingprep.com/api/v3/historical-chart/${interval}/${symbol}`
    );
    url.searchParams.set("apikey", FMP_API_KEY);

    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) throw new Error(`FMP history failed ${r.status}`);

    const raw = (await r.json()) as Bar[];
    const rows = Array.isArray(raw) ? raw.slice(0, limit).reverse() : [];

    return json({ ok: true, rows, count: rows.length, symbol, interval });
  } catch (e: any) {
    return err(e?.message || "Unexpected error", 500);
  }
}