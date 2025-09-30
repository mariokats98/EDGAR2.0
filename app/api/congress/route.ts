// app/api/congress/route.ts
import { NextResponse } from "next/server";

/**
 * Normalizes FMP congressional trading across House & Senate.
 * We try the official v4 endpoints first, then fall back to a couple of
 * alternate names some accounts expose.
 *
 * House shapes commonly include:
 *  - representative, ticker, assetDescription, transaction, amount, price, volume, owner, transactionDate, disclosureDate, link
 * Senate shapes commonly include:
 *  - senator, ticker, assetName, type (PURCHASE/SALE), amount, price, volume, owner, transactionDate, disclosureDate, link
 */

const FMP_KEY = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_KEY || "";
const BASE = "https://financialmodelingprep.com/api";

// candidates to try for each chamber (FMP accounts sometimes differ)
const SENATE_PATHS = [
  "/v4/senate-trading",
  "/v4/senate-trades",
  "/v4/ownership-senate-insider",
];
const HOUSE_PATHS = [
  "/v4/house-trading",
  "/v4/house-trades",
  "/v4/ownership-house-insider",
];

// lenient number parser (accepts "1,234.56")
const num = (v: any): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

const pick = (row: any, keys: string[]): any =>
  keys.find((k) => row?.[k] != null && row?.[k] !== "") ? row[keys.find((k) => row?.[k] != null && row?.[k] !== "") as string] : undefined;

function normalizeRow(row: any, chamber: "senate" | "house") {
  const member =
    (chamber === "senate"
      ? pick(row, ["senator", "member", "politician", "name"])
      : pick(row, ["representative", "member", "politician", "name"])) || "";

  const ticker = (row.symbol || row.ticker || "").toUpperCase();

  const company =
    pick(row, ["assetDescription", "assetName", "securityName", "company"]) || "";

  const actionRaw =
    pick(row, ["transaction", "type", "action"]) || ""; // PURCHASE / SALE / etc.
  const action = String(actionRaw).toUpperCase().includes("SALE")
    ? "S-SALE"
    : String(actionRaw).toUpperCase().includes("PUR")
    ? "P-PURCHASE"
    : String(actionRaw).toUpperCase();

  // amount is often a string range like "$1,001 - $15,000".
  // We'll pass it through, but also compute value when price * volume is available.
  const amountStr =
    pick(row, ["amount", "amountRange", "value"]) || "";

  const price =
    num(pick(row, ["price", "pricePerShare"])) ?? undefined;

  const volume =
    num(pick(row, ["volume", "shares"])) ?? undefined;

  const value =
    num(pick(row, ["transactionValue"])) ??
    (price != null && volume != null ? price * volume : undefined);

  const date =
    (pick(row, ["transactionDate", "date"]) || "").slice(0, 10);

  const filed =
    (pick(row, ["disclosureDate", "filingDate"])) || "";

  const link = pick(row, ["link", "url", "source"]);

  return {
    date,
    filed,
    member,
    ticker,
    company,
    action,
    shares: volume,
    price,
    value,
    amountText: amountStr, // show alongside numeric cols when available
    owner: pick(row, ["owner"]) || "",
    link,
    raw: row,
  };
}

async function fetchFirstWorking(pathList: string[], params: URLSearchParams) {
  for (const p of pathList) {
    const url = `${BASE}${p}?${params.toString()}`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (res.ok) {
      const js = await res.json();
      if (Array.isArray(js)) return js;
      // Some responses come as { data: [...] }
      if (Array.isArray(js?.data)) return js.data;
    }
  }
  return [];
}

export async function GET(req: Request) {
  try {
    if (!FMP_KEY) {
      return NextResponse.json({ ok: false, error: "Missing FMP_API_KEY" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const chamber = (searchParams.get("chamber") || "senate").toLowerCase() as
      | "senate"
      | "house";
    const qMember = (searchParams.get("member") || "").trim().toLowerCase();
    const qTicker = (searchParams.get("ticker") || "").trim().toUpperCase();
    const qText = (searchParams.get("q") || "").trim().toLowerCase();
    const from = (searchParams.get("from") || "").slice(0, 10);
    const to = (searchParams.get("to") || "").slice(0, 10);

    // Build query for FMP. These endpoints often accept: ticker, from, to, page
    const qp = new URLSearchParams();
    if (qTicker) qp.set("symbol", qTicker);
    if (from) qp.set("from", from);
    if (to) qp.set("to", to);
    qp.set("page", "0");
    qp.set("apikey", FMP_KEY);

    const raw =
      chamber === "senate"
        ? await fetchFirstWorking(SENATE_PATHS, qp)
        : await fetchFirstWorking(HOUSE_PATHS, qp);

    const rows = raw.map((r: any) => normalizeRow(r, chamber));

    // local filters (member + free text)
    const filtered = rows.filter((r: any) => {
      const okMember = !qMember || r.member.toLowerCase().includes(qMember);
      const okText =
        !qText ||
        r.member.toLowerCase().includes(qText) ||
        r.ticker.toLowerCase().includes(qText) ||
        (r.company || "").toLowerCase().includes(qText);
      return okMember && okText;
    });

    return NextResponse.json({ ok: true, rows: filtered });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}