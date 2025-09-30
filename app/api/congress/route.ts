// app/api/congress/route.ts
import { NextResponse } from "next/server";

const BASES: Record<"senate" | "house", string> = {
  senate: "https://financialmodelingprep.com/stable/senate-trades",
  house:  "https://financialmodelingprep.com/stable/house-trades",
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const chamber = (url.searchParams.get("chamber") || "senate").toLowerCase() as
      | "senate"
      | "house";
    const symbol = url.searchParams.get("symbol") || "";
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";

    const apikey = process.env.FMP_API_KEY || process.env.FMP_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
    if (!apikey) {
      return NextResponse.json(
        { ok: false, error: "Missing FMP_API_KEY in environment." },
        { status: 500 }
      );
    }

    const base = BASES[chamber] || BASES.senate;
    const u = new URL(base);
    if (symbol) u.searchParams.set("symbol", symbol);
    if (from) u.searchParams.set("from", from);
    if (to) u.searchParams.set("to", to);
    u.searchParams.set("apikey", apikey);

    const r = await fetch(u.toString(), { next: { revalidate: 0 } });
    const data = await r.json();

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: data?.error || "Upstream request failed" },
        { status: r.status }
      );
    }

    // FMP usually returns an array; normalize to array.
    const rows = Array.isArray(data) ? data : data?.data || [];
    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}