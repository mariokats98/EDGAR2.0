// app/api/crypto/list/route.ts
import { NextResponse } from "next/server";

const FMP_API_KEY = process.env.FMP_API_KEY || "";

export async function GET() {
  try {
    if (!FMP_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing FMP_API_KEY" },
        { status: 500 }
      );
    }

    // FMP list of available crypto symbols
    // Endpoint name can vary in FMP; this one returns a big flat list.
    const url = `https://financialmodelingprep.com/api/v3/symbol/available-cryptocurrencies?apikey=${encodeURIComponent(
      FMP_API_KEY
    )}`;

    const r = await fetch(url, {
      headers: { "User-Agent": "Herevna/1.0 (Crypto List)" },
      cache: "no-store",
    });

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `FMP failed ${r.status}` },
        { status: 502 }
      );
    }

    const arr = await r.json();
    // Normalize: expect [{symbol, name}, ...]
    const rows = Array.isArray(arr)
      ? arr
          .map((x: any) => ({
            symbol: String(x?.symbol || "").toUpperCase(),
            name: x?.name ? String(x.name) : undefined,
          }))
          .filter((x: any) => x.symbol) // keep only valid symbols
      : [];

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}