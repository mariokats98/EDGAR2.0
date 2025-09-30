// app/api/insider/activity/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_KEY = process.env.FMP_API_KEY || process.env.FMP_KEY;

type Raw = Record<string, any>;
type Row = {
  date?: string;
  insider?: string;
  ticker?: string;
  company?: string;
  action?: string;
  shares?: number;
  price?: number;
  value?: number;
  source?: string;
};

function toNum(v: any): number | undefined {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function first<T = any>(...cands: any[]): T | undefined {
  for (const c of cands) if (c !== undefined && c !== null && c !== "") return c as T;
  return undefined;
}

function normalize(r: Raw): Row {
  // Dates that appear in FMP insider payloads
  const date =
    first<string>(
      r.transactionDate,
      r.filingDate,
      r.reportedDate,
      r.effectDate,
      r.date
    ) || undefined;

  // Names & company
  const insider = first<string>(
    r.name,
    r.reportingName,
    r.reportingOwnerName,
    r.ownerName,
    r.insiderName
  );

  const company = first<string>(r.companyName, r.issuerName, r.issuer, r.issuerTradingName);

  // Ticker & action
  const ticker = first<string>(r.symbol, r.ticker, r.issuerTradingSymbol);

  let action =
    first<string>(r.transactionType, r.action, r.acquisitionOrDisposition) || undefined;
  // Normalize A/D letters if present
  if (action === "A") action = "A-ACQUIRE";
  if (action === "D") action = "D-DISPOSE";

  // Shares / Price / Value — FMP uses different keys across feeds
  const shares =
    first<number>(
      toNum(r.shares),
      toNum(r.securitiesTransacted),
      toNum(r.transactionShares),
      toNum(r.securitiesOwnedAfterTransaction)
    ) || undefined;

  const price = first<number>(toNum(r.price), toNum(r.transactionPrice), toNum(r.sharePrice));

  const value =
    first<number>(toNum(r.total), toNum(r.value), shares && price ? shares * price : undefined) ||
    undefined;

  const source = first<string>(r.link, r.url, r.form4Url);

  return { date, insider, ticker, company, action, shares, price, value, source };
}

function buildUrl(params: URLSearchParams) {
  const base = new URL("https://financialmodelingprep.com/api/v4/insider-trading");
  // pass-throughs supported by FMP:
  //  - symbol (ticker)
  //  - from, to (YYYY-MM-DD)
  //  - page / size (optional)
  const allow = ["symbol", "from", "to", "page", "size", "limit"];
  for (const k of allow) {
    const v = params.get(k);
    if (v) base.searchParams.set(k, v);
  }
  base.searchParams.set("apikey", FMP_KEY ?? "");
  return base.toString();
}

export async function GET(req: NextRequest) {
  if (!FMP_KEY) {
    return NextResponse.json(
      { ok: false, error: "Missing FMP_API_KEY in environment." },
      { status: 500 }
    );
  }

  const url = buildUrl(req.nextUrl.searchParams);

  try {
    const r = await fetch(url, { next: { revalidate: 0 } });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`FMP ${r.status}: ${text || r.statusText}`);
    }
    const json = (await r.json()) as Raw[] | { data?: Raw[] };

    const rawArray: Raw[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data! : [];
    const rows = rawArray.map(normalize);

    return NextResponse.json({ ok: true, rows });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Upstream error" },
      { status: 500 }
    );
  }
}