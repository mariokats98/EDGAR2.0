// app/api/crypto/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_API_KEY = process.env.FMP_API_KEY || "";

function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return json({ error: message }, { status });
}
function asNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: NextRequest) {
  try {
    if (!FMP_API_KEY) return err("Missing FMP_API_KEY", 500);

    const { searchParams } = new URL(req.url);
    const fn = (searchParams.get("fn") || "list").toLowerCase();

    if (fn === "list") {
      // Docs show this list endpoint
      const url = new URL("https://financialmodelingprep.com/api/v3/cryptocurrencies");
      url.searchParams.set("apikey", FMP_API_KEY);
      url.searchParams.set("limit", "150");

      const r = await fetch(url.toString(), { cache: "no-store" });
      if (!r.ok) return err(`FMP list failed ${r.status}`, r.status);
      const data = await r.json();

      const rows = (Array.isArray(data) ? data : []).map((c: any) => ({
        symbol: c.symbol,                                 // e.g., BTCUSD
        name: c.name || c.fullName || c.currency,         // best-effort name
        marketCap: asNum(c.marketCap),
        price: asNum(c.price),
        change24h: asNum(c.changesPercentage) ?? asNum(c.change24hPercent),
      }));

      // Sort by market cap desc and keep top 50
      rows.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
      return json({ ok: true, rows: rows.slice(0, 50) });
    }

    if (fn === "detail") {
      const symbol = (searchParams.get("symbol") || "").toUpperCase();
      const days = Math.min(365, Math.max(7, Number(searchParams.get("days") || "90")));
      if (!symbol) return err("Missing symbol", 400);

      // Quote
      const quoteUrl = new URL(`https://financialmodelingprep.com/api/v3/quote/${symbol}`);
      quoteUrl.searchParams.set("apikey", FMP_API_KEY);
      const q = await fetch(quoteUrl.toString(), { cache: "no-store" });
      if (!q.ok) return err(`FMP quote failed ${q.status}`, q.status);
      const qArr = await q.json();
      const quote = Array.isArray(qArr) && qArr[0] ? qArr[0] : {};

      // Historical (daily close)
      const histUrl = new URL(`https://financialmodelingprep.com/api/v3/historical-price-full/crypto/${symbol}`);
      histUrl.searchParams.set("apikey", FMP_API_KEY);
      histUrl.searchParams.set("serietype", "line");
      histUrl.searchParams.set("timeseries", String(days));
      const h = await fetch(histUrl.toString(), { cache: "no-store" });
      if (!h.ok) return err(`FMP historical failed ${h.status}`, h.status);
      const hist = await h.json();

      const series: { date: string; close: number }[] =
        hist?.historical?.map((d: any) => ({
          date: d.date,
          close: asNum(d.close) ?? asNum(d.adjClose) ?? 0,
        })) || [];

      // Normalize stat cards from quote
      const out = {
        symbol,
        name: quote?.name || quote?.symbol || symbol,
        price: asNum(quote?.price),
        change: asNum(quote?.change),
        changePercent: asNum(quote?.changesPercentage),
        volume: asNum(quote?.volume),
        marketCap: asNum(quote?.marketCap),
        dayLow: asNum(quote?.dayLow),
        dayHigh: asNum(quote?.dayHigh),
        yearHigh: asNum(quote?.yearHigh),
        yearLow: asNum(quote?.yearLow),
        series,
      };

      return json({ ok: true, data: out });
    }

    return err("Unknown fn", 400);
  } catch (e: any) {
    return err(e?.message || "Unexpected error", 500);
  }
}