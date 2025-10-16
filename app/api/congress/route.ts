// app/api/congress/route.ts
import { NextRequest, NextResponse } from "next/server";

type Chamber = "senate" | "house";
type Mode = "symbol" | "name";

function endpoint(chamber: Chamber, mode: Mode, q: string) {
  const base = "https://financialmodelingprep.com/stable";
  const encoded = encodeURIComponent(q.trim());
  if (mode === "symbol") {
    return chamber === "senate"
      ? `${base}/senate-trades?symbol=${encoded}`
      : `${base}/house-trades?symbol=${encoded}`;
  } else {
    return chamber === "senate"
      ? `${base}/senate-trades-by-name?name=${encoded}`
      : `${base}/house-trades-by-name?name=${encoded}`;
  }
}

/* ---------- helpers: robust extraction & normalization ---------- */

function tidyName(raw?: string | null) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Convert "Last, First M." -> "First M. Last"
  const m = s.match(/^([^,]+),\s*(.+)$/);
  if (m) return `${m[2]} ${m[1]}`.replace(/\s+/g, " ").trim();
  return s;
}

function extractMemberName(r: any): string | null {
  // Common keys seen in FMP variants
  const cand =
    r.senator ??
    r.representative ??
    r.politician ??
    r.politicianName ??
    r.member ??
    r.memberName ??
    r.name ??
    null;

  if (cand) return tidyName(cand);

  // Sometimes split fields
  const first = r.firstName ?? r.firstname ?? r.first_name;
  const last = r.lastName ?? r.lastname ?? r.last_name;
  if (first && last) return `${String(first).trim()} ${String(last).trim()}`;

  return null;
}

function toNumber(x: any): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(String(x).replace(/[,$\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Parse "$1,001–$15,000" (or "-" / "to" / "—" variants), also accepts a single amount like "$5,000"
function parseAmountRange(s: any): { min?: number; max?: number } {
  if (s == null) return {};
  const str = String(s).replace(/\u2013|\u2014/g, "-"); // en/em dash -> hyphen
  const two = str.match(/\$?\s*([\d,]+)\s*-\s*\$?\s*([\d,]+)/i);
  if (two) {
    const min = toNumber(two[1]);
    const max = toNumber(two[2]);
    return { min: min ?? undefined, max: max ?? undefined };
  }
  const one = str.match(/\$?\s*([\d,]+)/);
  if (one) {
    const v = toNumber(one[1]);
    return v != null ? { min: v, max: v } : {};
  }
  return {};
}

// shares fallback: check common alt keys
function extractShares(r: any): number | string | null {
  const direct =
    r.shares ??
    r.quantity ??
    r.units ??
    r.shareCount ??
    r.assetQuantity ??
    r.asset_amount ??
    r.assetUnits ??
    null;
  return direct ?? null;
}

function extractPrice(r: any): number | string | null {
  const price = r.price ?? r.pricePerShare ?? r.asset_price ?? r.tradePrice ?? null;
  return price ?? null;
}

function extractAmount(r: any): string | null {
  const amt =
    r.amount ??
    r.amountRange ??
    r.transactionAmount ??
    r.amount_total ??
    r.assetAmount ??
    null;
  return amt ?? null;
}

/**
 * If shares is missing but we have price and amount range,
 * compute "~min–max" shares (floored). If only a single amount, compute "~N".
 */
function estimateShares(amountStr: string | null, priceVal: number | string | null): string | null {
  const price = toNumber(priceVal);
  if (!amountStr || !price || price <= 0) return null;

  const { min, max } = parseAmountRange(amountStr);
  if (min == null && max == null) return null;

  const floor = (v: number | undefined) => (v != null ? Math.max(0, Math.floor(v / price)) : undefined);

  const sMin = floor(min);
  const sMax = floor(max);

  if (sMin != null && sMax != null) {
    if (sMin === sMax) return `~${sMin}`;
    return `~${sMin}–${sMax}`;
  }
  if (sMin != null) return `~${sMin}`;
  if (sMax != null) return `~${sMax}`;
  return null;
}

/* ---------- main row normalization ---------- */

function normalizeRow(r: any) {
  const memberName = extractMemberName(r);
  const price = extractPrice(r);
  const amount = extractAmount(r);

  let shares: number | string | null = extractShares(r);

  // If no explicit shares, try to estimate from amount & price
  if (shares == null) {
    const est = estimateShares(amount, price);
    if (est) shares = est; // string like "~12–148"
  }

  return {
    chamber: r.chamber ?? (r.senate ? "senate" : r.house ? "house" : null),
    memberName,
    transactionDate: r.transactionDate ?? r.date ?? null,
    transactionType: r.transaction ?? r.type ?? null, // Purchase / Sale (Full/Partial)
    ticker: r.symbol ?? r.ticker ?? null,
    assetName: r.assetName ?? r.asset_description ?? null,
    assetType: r.assetType ?? null,
    owner: r.owner ?? null, // Self / Spouse / Joint
    amount,                 // keep original string (often a range)
    shares,                 // exact number, alt-field, or "~range" estimation
    price,                  // exact or alt-field
    sourceUrl: r.link ?? r.source ?? null,
    filingDate: r.filing_date ?? r.reportedDate ?? null,
    state: r.state ?? null,
    party: r.party ?? null,
  };
}

/* ---------- handler ---------- */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const chamber = (searchParams.get("chamber") || "senate") as Chamber;
    const mode = (searchParams.get("mode") || "symbol") as Mode;

    if (!q) return NextResponse.json({ data: [], error: "Missing q" }, { status: 400 });
    if (!["senate", "house"].includes(chamber)) {
      return NextResponse.json({ data: [], error: "Invalid chamber" }, { status: 400 });
    }
    if (!["symbol", "name"].includes(mode)) {
      return NextResponse.json({ data: [], error: "Invalid mode" }, { status: 400 });
    }

    const key = process.env.FMP_API_KEY;
    if (!key) return NextResponse.json({ data: [], error: "Missing FMP_API_KEY" }, { status: 500 });

    const url = `${endpoint(chamber, mode, q)}&apikey=${encodeURIComponent(key)}`;
    const resp = await fetch(url, { cache: "no-store" });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { data: [], error: `FMP error ${resp.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const raw = await resp.json();
    const arr = Array.isArray(raw) ? raw : raw?.data ?? [];
    const data = arr.map(normalizeRow);

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ data: [], error: e?.message || "Unknown error" }, { status: 500 });
  }
}