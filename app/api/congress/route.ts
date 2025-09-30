// app/api/congress/route.ts
import { NextResponse } from "next/server";

const FMP_KEY = process.env.FMP_API_KEY!;

// NOTE: Adjust the FMP endpoints/params to your account’s dataset names.
// This handler accepts: chamber=senate|house, q (search), page, limit
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chamber = (searchParams.get("chamber") || "senate").toLowerCase();
  const q = (searchParams.get("q") || "").trim();
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "25");

  // You may need to tweak the exact endpoint names/fields to match your FMP plan.
  // The code below tries senate first; for house you’d use the corresponding dataset.
  // Example endpoints (verify in FMP docs):
  //   /api/v4/senate-trading?page={page}&apikey=...
  //   /api/v4/house-trading?page={page}&apikey=...
  // Some datasets accept ?symbol= and/or ?name= for search.
  const base =
    chamber === "house"
      ? "https://financialmodelingprep.com/api/v4/house-trading"
      : "https://financialmodelingprep.com/api/v4/senate-trading";

  const u = new URL(base);
  u.searchParams.set("page", String(page));
  u.searchParams.set("apikey", FMP_KEY);
  if (q) {
    // light heuristic: if it looks like a ticker, pass symbol; otherwise name
    if (/^[A-Z.\-]{1,6}$/.test(q.toUpperCase())) {
      u.searchParams.set("symbol", q.toUpperCase());
    } else {
      u.searchParams.set("name", q);
    }
  }

  try {
    const r = await fetch(u.toString(), { cache: "no-store" });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ ok: false, error: text || r.statusText }, { status: 500 });
    }
    const data = await r.json();

    // Normalize a few field names so the client can stay simple:
    const rows = (Array.isArray(data) ? data : data?.data || []).map((x: any, i: number) => ({
      id: x.id ?? `${chamber}-${page}-${i}`,
      filingDate: x.filingDate ?? x.disclosureDate ?? x.reportDate,
      transactionDate: x.transactionDate ?? x.txnDate ?? x.tradeDate,
      representative: x.representative ?? x.member ?? undefined,
      senator: x.senator ?? undefined,
      party: x.party ?? undefined,
      state: x.state ?? undefined,
      ticker: x.ticker ?? x.assetTicker ?? undefined,
      assetName: x.assetName ?? x.asset ?? undefined,
      type: x.type ?? x.transaction ?? x.transactionType ?? undefined,
      amount: x.amount ?? x.amountRange ?? undefined,
      link: x.link ?? x.source ?? undefined,
    }));

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Fetch failed" }, { status: 500 });
  }
}