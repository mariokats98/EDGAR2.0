// app/api/lookup/[symbol]/route.ts
import { NextResponse } from "next/server";

const UA =
  process.env.SEC_USER_AGENT ||
  "Herevna/1.0 (contact@herevna.io)";

// SEC master list of public companies (id, ticker, title, cik_str)
const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

// in-memory cache across serverless invocations (when possible)
let CACHE: {
  loadedAt: number;
  rows: Array<{ cik: string; ticker: string; name: string }>;
} | null = null;

async function loadSecList(): Promise<
  Array<{ cik: string; ticker: string; name: string }>
> {
  // reuse cache for 24h
  if (CACHE && Date.now() - CACHE.loadedAt < 24 * 60 * 60 * 1000) {
    return CACHE.rows;
  }
  const r = await fetch(SEC_TICKERS_URL, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    // always get the latest from SEC
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC tickers fetch failed: ${r.status}`);
  const j = await r.json();

  // shape is { "0": {cik_str, ticker, title}, ... }
  const rows: Array<{ cik: string; ticker: string; name: string }> = Object.values(
    j as any
  ).map((x: any) => ({
    cik: String(x.cik_str).padStart(10, "0"),
    ticker: String(x.ticker || "").toUpperCase(),
    name: String(x.title || ""),
  }));

  CACHE = { loadedAt: Date.now(), rows };
  return rows;
}

function normalizeTicker(input: string) {
  // Allow both “BRK.B” and “BRK-B”; SEC list uses dots for classes
  const up = input.toUpperCase().trim();
  return up.replace(/-/g, "."); // normalize hyphen → dot
}

type Match =
  | { ok: true; cik: string; ticker: string; name: string }
  | { ok: false; reason: string };

function bestMatch(
  q: string,
  rows: Array<{ cik: string; ticker: string; name: string }>
): Match {
  const raw = q.trim();
  if (!raw) return { ok: false, reason: "Empty query" };

  // 1) CIK numeric (1–10 digits)
  if (/^\d{1,10}$/.test(raw)) {
    const cik10 = raw.padStart(10, "0");
    const found = rows.find((r) => r.cik === cik10);
    if (found) return { ok: true, ...found };
    // It might be a valid CIK even if not in company_tickers.json (rare)
    return { ok: true, cik: cik10, ticker: "", name: "" };
  }

  // 2) Try ticker exact (allow class symbols)
  const t = normalizeTicker(raw);
  const byTicker = rows.find((r) => r.ticker === t);
  if (byTicker) return { ok: true, ...byTicker };

  // 3) Try company name exact (case-insensitive)
  const byNameExact = rows.find((r) => r.name.toLowerCase() === raw.toLowerCase());
  if (byNameExact) return { ok: true, ...byNameExact };

  // 4) Fuzzy: startsWith on ticker or name
  const startsTicker = rows.find((r) => r.ticker.startsWith(t));
  if (startsTicker) return { ok: true, ...startsTicker };

  const startsName = rows.find((r) => r.name.toLowerCase().startsWith(raw.toLowerCase()));
  if (startsName) return { ok: true, ...startsName };

  // 5) Fuzzy: includes on name (e.g., “Nvidia”, “Webull”, “Exxon Mobil”)
  const includesName = rows.find((r) =>
    r.name.toLowerCase().includes(raw.toLowerCase())
  );
  if (includesName) return { ok: true, ...includesName };

  return { ok: false, reason: "Ticker/Company not recognized" };
}

export async function GET(
  req: Request,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol = decodeURIComponent(params.symbol || "").trim();
    if (!symbol) {
      return NextResponse.json(
        { error: "Missing symbol" },
        { status: 400 }
      );
    }

    const rows = await loadSecList();
    const match = bestMatch(symbol, rows);

    if (!match.ok) {
      return NextResponse.json({ error: match.reason }, { status: 404 });
    }

    const { cik, ticker, name } = match;
    return NextResponse.json({ cik, ticker, name });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Lookup error" },
      { status: 500 }
    );
  }
}