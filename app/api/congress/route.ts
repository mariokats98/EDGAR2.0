// app/api/congress/route.ts
import { NextResponse } from "next/server";

/**
 * Defensive proxy for Congressional trades.
 * Supports:
 *  - chamber: "senate" | "house"
 *  - member: string (partial match)
 *  - ticker: string (exact or partial)
 *  - q: string (searched against member OR ticker)
 *  - from/to: YYYY-MM-DD (inclusive)
 *  - limit: max rows to return (default 500)
 *
 * It calls FMP v4 endpoints and normalizes shapes:
 *  Senate: /v4/senate-trading
 *  House:  /v4/house-trading
 *
 * You must set FMP_API_KEY or NEXT_PUBLIC_FMP_API_KEY.
 */

const FMP_BASE = "https://financialmodelingprep.com/api";
const API_KEY = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

type RawRow = Record<string, any>;

function normalizeRow(r: RawRow) {
  // Try a wide set of aliases seen across FMP datasets
  const date =
    r.transactionDate ||
    r.disclosureDate ||
    r.date ||
    r.reportDate ||
    r.filingDate ||
    null;

  const member =
    r.senator ||
    r.representative ||
    r.member ||
    r.name ||
    r.politician ||
    null;

  const ticker =
    r.symbol ||
    r.ticker ||
    r.assetSymbol ||
    null;

  const company =
    r.company ||
    r.issuer ||
    r.assetDescription ||
    r.securityName ||
    r.companyName ||
    null;

  const action =
    r.transaction ||
    r.transactionType ||
    r.type ||
    r.action ||
    null;

  const amount =
    r.amount ||
    r.amountRange ||
    r.value ||
    r.transactionAmount ||
    null;

  const price =
    typeof r.price === "number"
      ? r.price
      : Number.isFinite(+r.price)
      ? +r.price
      : null;

  const link =
    r.link ||
    r.url ||
    r.source ||
    r.formUrl ||
    r.form4Url ||
    null;

  return {
    date,
    member,
    ticker,
    company,
    action,
    amount,
    price,
    link,
    // keep original in case you want to show more fields later
    _raw: r,
  };
}

function inRangeISO(iso: string, from?: string, to?: string) {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

export async function GET(req: Request) {
  try {
    if (!API_KEY) return bad("Missing FMP_API_KEY on server");

    const { searchParams } = new URL(req.url);
    const chamber = (searchParams.get("chamber") || "senate").toLowerCase();
    const q = (searchParams.get("q") || "").trim();
    const member = (searchParams.get("member") || "").trim();
    const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();
    const from = (searchParams.get("from") || "").trim();
    const to = (searchParams.get("to") || "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 2000);

    const endpoint =
      chamber === "house" ? "/v4/house-trading" : "/v4/senate-trading";

    // FMP params: keep simple (some fields are not filterable remotely),
    // we’ll filter locally for reliability.
    const sp = new URLSearchParams();
    sp.set("apikey", API_KEY);
    // If FMP accepts symbol/from/to on your plan, you CAN set them here too:
    // if (ticker) sp.set("symbol", ticker);
    // if (from) sp.set("from", from);
    // if (to) sp.set("to", to);

    const url = `${FMP_BASE}${endpoint}?${sp.toString()}`;
    const res = await fetch(url, { next: { revalidate: 0 } });

    if (!res.ok) {
      const text = await res.text();
      return bad(`FMP error (${res.status}): ${text || res.statusText}`, res.status);
    }

    const data = await res.json();
    const list: RawRow[] = Array.isArray(data) ? data : [];

    // Normalize
    let rows = list.map(normalizeRow);

    // Server-side filtering for robustness
    const qLower = q.toLowerCase();
    const memberLower = member.toLowerCase();

    rows = rows.filter((r) => {
      // date range
      if (from || to) {
        if (!r.date || !inRangeISO(String(r.date).slice(0, 10), from || undefined, to || undefined)) {
          return false;
        }
      }
      // ticker filter
      if (ticker && !(r.ticker || "").toUpperCase().includes(ticker)) return false;

      // member filter
      if (memberLower && !(r.member || "").toLowerCase().includes(memberLower)) return false;

      // generic q (matches member OR ticker OR company)
      if (qLower) {
        const hay =
          `${r.member || ""} ${r.ticker || ""} ${r.company || ""}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });

    // Cap and return
    rows = rows.slice(0, limit);

    return NextResponse.json({ ok: true, rows, chamber });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}