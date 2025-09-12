// app/api/stocks/quote/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_API_KEY = process.env.FMP_API_KEY || "";

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
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return err("symbol required", 400);

    const [qRes, pRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${FMP_API_KEY}`, { cache: "no-store" }),
      fetch(`https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${FMP_API_KEY}`, { cache: "no-store" }),
    ]);

    if (!qRes.ok) throw new Error(`quote ${qRes.status}`);
    if (!pRes.ok) throw new Error(`profile ${pRes.status}`);

    const quoteArr = await qRes.json();
    const profileArr = await pRes.json();

    const quote = Array.isArray(quoteArr) ? quoteArr[0] : null;
    const profile = Array.isArray(profileArr) ? profileArr[0] : null;

    return json({ ok: true, symbol, quote, profile });
  } catch (e: any) {
    return err(e?.message || "Unexpected error", 500);
  }
}