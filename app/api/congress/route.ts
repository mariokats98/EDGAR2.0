import { NextRequest, NextResponse } from "next/server";

type Chamber = "senate" | "house";
type Mode = "symbol" | "name";

function endpoint(chamber: Chamber, mode: Mode, q: string) {
  const base = "https://financialmodelingprep.com/stable";
  const encoded = encodeURIComponent(q.trim());
  if (chamber === "senate" && mode === "symbol") return `${base}/senate-trades?symbol=${encoded}`;
  if (chamber === "house"  && mode === "symbol") return `${base}/house-trades?symbol=${encoded}`;
  if (chamber === "senate" && mode === "name")   return `${base}/senate-trades-by-name?name=${encoded}`;
  if (chamber === "house"  && mode === "name")   return `${base}/house-trades-by-name?name=${encoded}`;
  throw new Error("Bad params");
}

// Normalize FMP rows for UI
function normalizeRow(r: any) {
  return {
    chamber: r.chamber ?? (r.senate ? "senate" : r.house ? "house" : null),
    memberName: r.senator || r.representative || r.politician || r.name || null,
    transactionDate: r.transactionDate ?? r.date ?? null,
    transactionType: r.transaction ?? r.type ?? null,  // e.g., Purchase, Sale (Full/Partial)
    ticker: r.symbol ?? r.ticker ?? null,
    assetName: r.assetName ?? r.asset_description ?? null,
    assetType: r.assetType ?? null,
    owner: r.owner ?? null,            // Self / Spouse / Joint
    amount: r.amount ?? r.amountRange ?? null, // often a range string
    shares: r.shares ?? null,          // may be absent
    price: r.price ?? null,            // may be absent
    sourceUrl: r.link || r.source || null,
    filingDate: r.filing_date ?? r.reportedDate ?? null,
    state: r.state ?? null,
    party: r.party ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const chamber = (searchParams.get("chamber") || "senate") as Chamber;
    const mode = (searchParams.get("mode") || "symbol") as Mode;

    if (!q) return NextResponse.json({ data: [], error: "Missing q" }, { status: 400 });

    const url = endpoint(chamber, mode, q);
    const key = process.env.FMP_API_KEY;
    if (!key) return NextResponse.json({ data: [], error: "Missing FMP_API_KEY" }, { status: 500 });

    const resp = await fetch(`${url}&apikey=${key}`, { next: { revalidate: 60 } });
    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ data: [], error: `FMP ${resp.status}: ${text.slice(0,200)}` }, { status: 502 });
    }
    const raw = await resp.json();
    const arr = Array.isArray(raw) ? raw : (raw?.data ?? []);
    const data = arr.map(normalizeRow);
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ data: [], error: e.message || "Unknown error" }, { status: 500 });
  }
}