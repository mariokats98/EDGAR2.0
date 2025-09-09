// app/api/lookup/[symbol]/route.ts
import { NextResponse } from "next/server";

const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const UA = process.env.SEC_USER_AGENT || "Herevna/1.0 (contact@herevna.io)";

type Row = { cik: string; ticker: string; name: string };

let CACHE: { loadedAt: number; rows: Row[] } | null = null;

async function loadRows(): Promise<Row[]> {
  if (CACHE && Date.now() - CACHE.loadedAt < 24 * 60 * 60 * 1000) return CACHE.rows;
  const r = await fetch(SEC_TICKERS_URL, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC list fetch failed: ${r.status}`);
  const j = await r.json();
  const rows: Row[] = Object.values(j as any).map((x: any) => ({
    cik: String(x.cik_str).padStart(10, "0"),
    ticker: String(x.ticker || "").toUpperCase(),
    name: String(x.title || ""),
  }));
  CACHE = { loadedAt: Date.now(), rows };
  return rows;
}

function normalizeTicker(s: string) {
  // Handle class tickers like BRK.B → BRK.B and BRK-B
  const up = s.toUpperCase();
  return [up, up.replace(".", "-")];
}

export async function GET(
  _req: Request,
  { params }: { params: { symbol: string } }
) {
  try {
    const raw = (params.symbol || "").trim();
    if (!raw) return NextResponse.json({ error: "Empty symbol" }, { status: 400 });

    // If it looks like a CIK (digits only up to 10), return as-is
    if (/^\d{1,10}$/.test(raw)) {
      return NextResponse.json({
        kind: "cik",
        cik: raw.padStart(10, "0"),
      });
    }

    const rows = await loadRows();
    const up = raw.toUpperCase();

    // Try exact ticker first (including dot and dash variant)
    const variants = normalizeTicker(up);
    const exact = rows.find((r) => variants.includes(r.ticker));
    if (exact) {
      return NextResponse.json({
        kind: "ticker",
        cik: exact.cik,
        ticker: exact.ticker,
        name: exact.name,
      });
    }

    // Try company name contains
    const byName = rows.find((r) => r.name.toUpperCase().includes(up));
    if (byName) {
      return NextResponse.json({
        kind: "name",
        cik: byName.cik,
        ticker: byName.ticker,
        name: byName.name,
      });
    }

    return NextResponse.json(
      { error: "Ticker/Company not recognized" },
      { status: 404 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Lookup error" },
      { status: 500 }
    );
  }
}