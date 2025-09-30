// app/api/congress/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_BASE = "https://financialmodelingprep.com/api/v4";
const SENATE_EP = `${FMP_BASE}/senate-trading`;
const HOUSE_EP = `${FMP_BASE}/house-trading`;

function dateOnly(s?: string) {
  return (s || "").slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chamber = (searchParams.get("chamber") || "senate").toLowerCase();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tickerQ = (searchParams.get("ticker") || "").toUpperCase();
    const memberQ = (searchParams.get("member") || "").toLowerCase();

    const apiKey =
      process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_KEY || "";
    const endpoint = chamber === "house" ? HOUSE_EP : SENATE_EP;

    const url = new URL(endpoint);
    url.searchParams.set("page", "0");
    url.searchParams.set("size", "500");
    if (apiKey) url.searchParams.set("apikey", apiKey);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `FMP error ${res.status}` },
        { status: 502 }
      );
    }
    const json = await res.json();
    const list = Array.isArray(json)
      ? json
      : Array.isArray(json?.data)
      ? json.data
      : [];

    let rows = list.map((raw: any) => {
      return {
        date:
          dateOnly(raw?.transactionDate) ||
          dateOnly(raw?.date) ||
          dateOnly(raw?.filed),
        member:
          raw?.representative ||
          raw?.senator ||
          raw?.politicianName ||
          raw?.name ||
          "",
        ticker: raw?.ticker || raw?.assetTicker || "",
        company:
          raw?.assetDescription || raw?.company || raw?.asset_name || "",
        action:
          raw?.typeOfTransaction ||
          raw?.transaction ||
          raw?.type ||
          raw?.action ||
          "",
        shares: raw?.shares || 0,
        price: raw?.price || 0,
        value: raw?.value || 0,
        amount: raw?.amount || raw?.amountRange || "",
        link: raw?.link || raw?.source || "",
      };
    });

    // apply filters
    if (from || to) {
      const fromT = from ? new Date(from).getTime() : undefined;
      const toT = to ? new Date(to).getTime() : undefined;
      rows = rows.filter((r) => {
        const t = r.date ? new Date(r.date).getTime() : NaN;
        if (!Number.isFinite(t)) return false;
        if (fromT && t < fromT) return false;
        if (toT && t > toT) return false;
        return true;
      });
    }
    if (tickerQ) {
      rows = rows.filter((r) => (r.ticker || "").toUpperCase() === tickerQ);
    }
    if (memberQ) {
      rows = rows.filter((r) =>
        (r.member || "").toLowerCase().includes(memberQ)
      );
    }

    rows.sort((a, b) => (a.date > b.date ? -1 : 1));

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}