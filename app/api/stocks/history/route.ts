// app/api/stocks/history/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_API_KEY = process.env.FMP_API_KEY || "";

function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return json({ ok: false, error: message }, { status });
}

const INTRA = new Set(["1min", "5min", "15min", "30min", "1hour", "4hour"]);

export async function GET(req: NextRequest) {
  try {
    if (!FMP_API_KEY) return err("Missing FMP_API_KEY", 500);

    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const interval = (searchParams.get("interval") || "").toLowerCase();
    const limit = Math.min(5000, Math.max(50, Number(searchParams.get("limit") || "1000")));
    const from = (searchParams.get("from") || "").slice(0, 10);
    const to = (searchParams.get("to") || "").slice(0, 10);

    if (!symbol) return err("symbol required", 400);

    if (interval && INTRA.has(interval)) {
      const url = `https://financialmodelingprep.com/api/v3/historical-chart/${interval}/${symbol}?apikey=${FMP_API_KEY}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`intraday ${r.status}`);
      const raw = await r.json();
      const rows = Array.isArray(raw) ? raw.slice(0, limit).reverse() : [];
      return json({ ok: true, kind: "intraday", interval, rows });
    }

    // daily (historical-price-full) optionally with date range
    const base = new URL(`https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}`);
    if (from) base.searchParams.set("from", from);
    if (to) base.searchParams.set("to", to);
    base.searchParams.set("serietype", "line");
    base.searchParams.set("apikey", FMP_API_KEY);

    const r = await fetch(base.toString(), { cache: "no-store" });
    if (!r.ok) throw new Error(`daily ${r.status}`);

    const j = await r.json();
    const rows = (j?.historical || []).slice(-limit); // last N, already oldest→newest for serietype=line
    return json({ ok: true, kind: "daily", rows });
  } catch (e: any) {
    return err(e?.message || "Unexpected error", 500);
  }
}