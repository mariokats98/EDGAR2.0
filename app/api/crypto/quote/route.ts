// app/api/crypto/quote/route.ts
import { NextResponse } from "next/server";

const KEY = process.env.FMP_API_KEY || "";

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const raw = (u.searchParams.get("symbol") || "BTCUSD").toUpperCase();
    const symbol = raw.replace(/[^A-Z0-9.\-]/g, "").slice(0, 20) || "BTCUSD";

    if (!KEY) return bad("Missing FMP_API_KEY", 500);

    // Try direct quote endpoint first
    const url1 = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(
      symbol
    )}?apikey=${encodeURIComponent(KEY)}`;
    const r1 = await fetch(url1, {
      headers: { "User-Agent": "Herevna/1.0 (CryptoQuote)" },
      cache: "no-store",
    });

    if (r1.ok) {
      const a = await r1.json();
      if (Array.isArray(a) && a.length) {
        const q = a[0];
        return NextResponse.json({ ok: true, quote: q });
      }
    }

    // Fallback: pull all crypto quotes and find the symbol
    const url2 = `https://financialmodelingprep.com/api/v3/quotes/crypto?apikey=${encodeURIComponent(
      KEY
    )}`;
    const r2 = await fetch(url2, {
      headers: { "User-Agent": "Herevna/1.0 (CryptoQuoteFallback)" },
      cache: "no-store",
    });
    if (!r2.ok) return bad(`FMP failed ${r2.status}`, 502);
    const list = await r2.json();
    const hit = Array.isArray(list)
      ? list.find((x: any) => String(x?.symbol || "").toUpperCase() === symbol)
      : null;
    if (!hit) return bad("Symbol not found", 404);

    return NextResponse.json({ ok: true, quote: hit });
  } catch (e: any) {
    return bad(e?.message || "Unexpected error", 500);
  }
}