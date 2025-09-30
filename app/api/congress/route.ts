// app/api/congress/route.ts
import { NextResponse } from "next/server";

const FMP_KEY = process.env.FMP_API_KEY;

// Optional: force this route to run on the Edge or Node.
// export const runtime = "edge";

export async function GET(req: Request) {
  if (!FMP_KEY) {
    return NextResponse.json(
      { ok: false, error: "Missing FMP_API_KEY in environment." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);

  // inputs
  const chamber = (searchParams.get("chamber") || "senate").toLowerCase();
  const q = (searchParams.get("q") || "").trim();
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || "25")));

  // choose endpoint
  const base =
    chamber === "house"
      ? "https://financialmodelingprep.com/api/v4/house-trading"
      : "https://financialmodelingprep.com/api/v4/senate-trading";

  const u = new URL(base);
  u.searchParams.set("page", String(page));
  u.searchParams.set("apikey", FMP_KEY);

  // search: try both symbol & name styles FMP uses across datasets
  if (q) {
    const looksLikeTicker = /^[A-Z.\-]{1,6}$/.test(q.toUpperCase());
    if (looksLikeTicker) {
      u.searchParams.set("symbol", q.toUpperCase());
    } else {
      // person name
      u.searchParams.set("name", q);
      // some endpoints accept "search"
      u.searchParams.set("search", q);
    }
  }

  try {
    const r = await fetch(u.toString(), { cache: "no-store" });

    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { ok: false, error: text || r.statusText },
        { status: 502 }
      );
    }

    // FMP sometimes returns array, sometimes {data: [...]}
    const data = await r.json();
    const list: any[] = Array.isArray(data) ? data : data?.data || [];

    // normalize rows so UI always has consistent fields
    const rows = list.map((x: any, i: number) => {
      const first = x.first_name || x.firstName;
      const last = x.last_name || x.lastName;

      const politician =
        x.representative ||
        x.senator ||
        x.member ||
        x.politician ||
        [first, last].filter(Boolean).join(" ").trim() ||
        undefined;

      const ticker =
        x.ticker ||
        x.assetTicker ||
        x.symbol ||
        x.tickerSymbol ||
        x.stock ||
        undefined;

      const assetName =
        x.assetName ||
        x.asset ||
        x.securityName ||
        x.asset_description ||
        undefined;

      const filingDate =
        x.filingDate || x.disclosureDate || x.reportDate || x.filed || x.date;

      const transactionDate =
        x.transactionDate || x.txnDate || x.tradeDate || x.transaction_date;

      const type =
        x.type || x.transaction || x.transactionType || x.action;

      const amount =
        x.amount || x.amountRange || x.amount_range || x.range;

      const link = x.link || x.source || x.url;

      return {
        id: x.id ?? `${chamber}-${page}-${i}`,
        filingDate,
        transactionDate,
        representative: chamber === "house" ? politician : undefined,
        senator: chamber === "senate" ? politician : undefined,
        party: x.party,
        state: x.state || x.member_state,
        ticker,
        assetName,
        type,
        amount,
        link,
      };
    });

    // Apply a simple page-size cap for the UI's "hasMore" logic
    const pageRows = rows.slice(0, limit);

    return NextResponse.json({ ok: true, rows: pageRows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Fetch failed" },
      { status: 500 }
    );
  }
}