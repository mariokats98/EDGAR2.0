// app/api/insider/activity/route.ts
import { NextResponse } from "next/server";

// ENV required: FMP_API_KEY
// Example FMP endpoint: https://financialmodelingprep.com/api/v4/insider-trading?symbol=AAPL&apikey=KEY

type FmpTrade = {
  symbol: string;                    // issuer symbol
  filingDate: string;                // "2025-08-14"
  transactionDate?: string;          // sometimes present
  reportingCik?: string;
  reportingName?: string;            // insider name
  reportingTitle?: string;           // insider title (sometimes)
  issuerCik?: string;
  issuerName?: string;
  transactionType?: string;          // "P - Purchase", "S - Sale", etc.
  securitiesTransacted?: number;     // shares
  price?: number;                    // price per share
  link?: string;                     // EDGAR link when present
  [k: string]: any;
};

type Row = {
  id: string;
  date: string;            // filing date (local)
  action: "BUY" | "SELL" | "OTHER";
  insider: string;
  title?: string;
  company: string;
  symbol: string;
  shares?: number;
  price?: number;
  valueUSD?: number;
  filingUrl?: string;
};

function parseAction(tt?: string): "BUY" | "SELL" | "OTHER" {
  if (!tt) return "OTHER";
  const t = tt.toUpperCase();
  if (t.includes("P") || t.includes("PURCHASE") || t.includes("BUY")) return "BUY";
  if (t.includes("S") || t.includes("SALE") || t.includes("SELL")) return "SELL";
  return "OTHER";
}

function toMoney(n?: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return undefined;
  return Math.round(n * 100) / 100;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase(); // optional filter
    const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
    const apiKey = process.env.FMP_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing FMP_API_KEY" },
        { status: 500 }
      );
    }

    // If a symbol is provided, hit the symbol-specific endpoint.
    // Otherwise, use the global endpoint with pagination.
    const base = "https://financialmodelingprep.com/api/v4";
    const url = symbol
      ? `${base}/insider-trading?symbol=${encodeURIComponent(symbol)}&page=0&apikey=${apiKey}`
      : `${base}/insider-trading?period=latest&page=0&apikey=${apiKey}`;

    const r = await fetch(url, { next: { revalidate: 60 }, cache: "no-store" });

    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { error: "Upstream error", details: text },
        { status: 502 }
      );
    }

    const raw = (await r.json()) as FmpTrade[];

    // Normalize & sort by filingDate desc
    const rows: Row[] = raw
      .map((t, idx) => {
        const action = parseAction(t.transactionType);
        const shares = t.securitiesTransacted ? Number(t.securitiesTransacted) : undefined;
        const price = t.price ? Number(t.price) : undefined;
        const valueUSD = shares && price ? shares * price : undefined;

        const dateISO = (t.filingDate || t.transactionDate || "").slice(0, 10);
        const date = dateISO || ""; // keep it simple; client can pretty-format

        return {
          id: `${t.symbol}-${t.filingDate}-${idx}`,
          date,
          action,
          insider: t.reportingName || "Unknown",
          title: t.reportingTitle,
          company: t.issuerName || t.symbol || "—",
          symbol: t.symbol || "",
          shares,
          price: toMoney(price),
          valueUSD: valueUSD ? toMoney(valueUSD) : undefined,
          filingUrl: t.link,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, limit);

    return NextResponse.json({ ok: true, count: rows.length, data: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected" }, { status: 500 });
  }
}