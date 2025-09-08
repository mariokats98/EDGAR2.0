// app/api/ticker/route.ts
import { NextResponse } from "next/server";

const AV_KEY = process.env.ALPHA_VANTAGE_KEY || "";
const FRED_KEY = process.env.FRED_API_KEY || "";

export const revalidate = 60; // cache at the edge for ~60s

async function getAVQuote(symbol: string) {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
    symbol
  )}&apikey=${AV_KEY}`;
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  const q = j["Global Quote"] || {};
  const price = parseFloat(q["05. price"]);
  const changePct = parseFloat(q["10. change percent"]) || 0;
  return { price, changePct };
}

async function getAVFx(pair: string) {
  // pair e.g. "EURUSD", "USDJPY"
  // Use CURRENCY_EXCHANGE_RATE for near-real-time mid quote
  const [from, to] = [pair.slice(0, 3), pair.slice(3)];
  const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${from}&to_currency=${to}&apikey=${AV_KEY}`;
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  const data = j["Realtime Currency Exchange Rate"] || {};
  const rate = parseFloat(data["5. Exchange Rate"]);
  return rate;
}

async function getFREDSeriesLatest(id: string) {
  // Grab last 2 obs to compute Δ if available
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(
    id
  )}&sort_order=desc&limit=2&api_key=${FRED_KEY}&file_type=json`;
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  const obs = (j?.observations || [])
    .map((o: any) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((o: any) => Number.isFinite(o.value));
  const latest = obs[0];
  const prev = obs[1];
  return {
    value: latest?.value ?? null,
    delta: latest && prev ? latest.value - prev.value : null,
    date: latest?.date,
  };
}

export async function GET() {
  try {
    const tasks = [
      // Stocks (ETFs)
      (async () => {
        const { price, changePct } = await getAVQuote("SPY");
        return { symbol: "SPY", label: "S&P 500 (SPY)", value: price, delta: changePct, unit: "%" };
      })(),
      (async () => {
        const { price, changePct } = await getAVQuote("QQQ");
        return { symbol: "QQQ", label: "NASDAQ 100 (QQQ)", value: price, delta: changePct, unit: "%" };
      })(),

      // FX
      (async () => {
        const rate = await getAVFx("EURUSD");
        return { symbol: "EURUSD", label: "EUR/USD", value: rate, delta: null, unit: "" };
      })(),
      (async () => {
        const rate = await getAVFx("USDJPY");
        return { symbol: "USDJPY", label: "USD/JPY", value: rate, delta: null, unit: "" };
      })(),

      // Treasuries (FRED)
      (async () => {
        const { value, delta } = await getFREDSeriesLatest("DGS2");
        return { symbol: "UST2Y", label: "UST 2Y", value, delta, unit: "%" };
      })(),
      (async () => {
        const { value, delta } = await getFREDSeriesLatest("DGS10");
        return { symbol: "UST10Y", label: "UST 10Y", value, delta, unit: "%" };
      })(),
    ];

    const results = await Promise.allSettled(tasks);
    const items = results
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter(Boolean)
      .map((it: any) => {
        const val =
          typeof it.value === "number" && Number.isFinite(it.value) ? it.value : null;
        const delta =
          typeof it.delta === "number" && Number.isFinite(it.delta) ? it.delta : null;
        return { ...it, value: val, delta };
      });

    return NextResponse.json({ ok: true, items }, { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=60" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ticker failed" }, { status: 500 });
  }
}

