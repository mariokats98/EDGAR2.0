// app/api/congress/route.ts
import { NextRequest, NextResponse } from "next/server";

type Chamber = "senate" | "house" | "all";
type Mode = "symbol" | "name";
type TxFilter = "all" | "purchase" | "sale";

function tidyName(raw?: string | null) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^([^,]+),\s*(.+)$/); // "Last, First" → "First Last"
  if (m) return `${m[2]} ${m[1]}`.replace(/\s+/g, " ").trim();
  return s;
}

function extractMemberName(r: any): string | null {
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
  const first = r.firstName ?? r.firstname ?? r.first_name;
  const last = r.lastName ?? r.lastname ?? r.last_name;
  if (first && last) return `${String(first).trim()} ${String(last).trim()}`;
  return null;
}

function extractPrice(r: any): number | string | null {
  return r.price ?? r.pricePerShare ?? r.asset_price ?? r.tradePrice ?? null;
}

function extractAmount(r: any): string | null {
  return (
    r.amount ??
    r.amountRange ??
    r.transactionAmount ??
    r.amount_total ??
    r.assetAmount ??
    null
  );
}

function normalizeTxType(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (s.includes("purchase") || s.includes("buy")) return "Purchase";
  if (s.includes("sale") || s.includes("sell")) return "Sale";
  return String(raw);
}

function normalizeRow(r: any) {
  return {
    memberName: extractMemberName(r),
    transactionDate:
      r.transactionDate ?? r.date ?? r.filing_date ?? r.reportedDate ?? null,
    transactionType: normalizeTxType(r.transaction ?? r.type ?? null),
    ticker: r.symbol ?? r.ticker ?? null,
    assetName: r.assetName ?? r.asset_description ?? null,
    assetType: r.assetType ?? null,
    owner: r.owner ?? null,
    amount: extractAmount(r),
    price: extractPrice(r),
    sourceUrl: r.link ?? r.source ?? null,
    state: r.state ?? null,
    party: r.party ?? null,
  };
}

function inDateRange(d: string | null, start?: string | null, end?: string | null) {
  if (!d) return false;
  const t = Date.parse(d);
  if (Number.isNaN(t)) return false;
  if (start) {
    const s = Date.parse(start);
    if (!Number.isNaN(s) && t < s) return false;
  }
  if (end) {
    const e = new Date(end);
    const ePlus = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1).getTime();
    if (t >= ePlus) return false;
  }
  return true;
}

function passTxFilter(tx: TxFilter, t: string | null) {
  if (tx === "all") return true;
  if (!t) return false;
  const canonical = normalizeTxType(t);
  if (tx === "purchase") return canonical === "Purchase";
  if (tx === "sale") return canonical === "Sale";
  return true;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const viewRaw = (searchParams.get("view") || "").toLowerCase();
    const qRaw = (searchParams.get("q") || "").trim();
    const isLatest = viewRaw === "latest" || (!viewRaw && (!qRaw || qRaw.length === 0));

    const chamberParam = (searchParams.get("chamber") || (isLatest ? "all" : "senate")) as Chamber;
    const mode = (searchParams.get("mode") || "symbol") as Mode;
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const tx = (searchParams.get("tx") || "all").toLowerCase() as TxFilter;
    const limit = Math.max(1, Math.min(1000, Number(searchParams.get("limit") || 200)));

    let rows: any[] = [];

    if (isLatest) {
      const urls =
        chamberParam === "all"
          ? [
              `https://financialmodelingprep.com/api/v4/senate-latest?apikey=${process.env.FMP_API_KEY}`,
              `https://financialmodelingprep.com/api/v4/house-latest?apikey=${process.env.FMP_API_KEY}`,
            ]
          : [
              `https://financialmodelingprep.com/api/v4/${chamberParam}-latest?apikey=${process.env.FMP_API_KEY}`,
            ];

      const responses = await Promise.all(urls.map((u) => fetch(u)));
      const bad = responses.find((r) => !r.ok);
      if (bad) {
        const txt = await bad.text();
        return NextResponse.json(
          { data: [], error: `Upstream error ${bad.status}: ${txt.slice(0, 200)}` },
          { status: 502 }
        );
      }
      const payloads = await Promise.all(responses.map((r) => r.json()));
      rows = payloads.flat();
    } else {
      if (!qRaw) {
        return NextResponse.json({ data: [], error: "Missing q" }, { status: 400 });
      }
      if (!["senate", "house"].includes(chamberParam)) {
        return NextResponse.json({ data: [], error: "Invalid chamber" }, { status: 400 });
      }

      const url =
        mode === "symbol"
          ? `https://financialmodelingprep.com/api/v4/${chamberParam}-trading?symbol=${encodeURIComponent(
              qRaw
            )}&apikey=${process.env.FMP_API_KEY}`
          : `https://financialmodelingprep.com/api/v4/${chamberParam}-trading-by-name?name=${encodeURIComponent(
              qRaw
            )}&apikey=${process.env.FMP_API_KEY}`;

      const resp = await fetch(url);
      if (!resp.ok) {
        const txt = await resp.text();
        return NextResponse.json(
          { data: [], error: `Upstream error ${resp.status}: ${txt.slice(0, 200)}` },
          { status: 502 }
        );
      }
      rows = await resp.json();
    }

    let data = rows.map(normalizeRow);

    const hasDateFilter = (start && start.length === 10) || (end && end.length === 10);
    if (hasDateFilter) {
      data = data.filter((r) => inDateRange(r.transactionDate, start, end));
    }
    if (tx !== "all") {
      data = data.filter((r) => passTxFilter(tx, r.transactionType));
    }

    data.sort((a, b) => {
      const ta = Date.parse(a.transactionDate || "");
      const tb = Date.parse(b.transactionDate || "");
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return tb - ta;
    });

    if (limit) data = data.slice(0, limit);

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json(
      { data: [], error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}