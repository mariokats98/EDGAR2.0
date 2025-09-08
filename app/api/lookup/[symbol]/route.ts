// app/api/lookup/[symbol]/route.ts
import { NextResponse } from "next/server";

const UA = process.env.SEC_USER_AGENT || "HerevnaBot/1.0 (admin@herevna.io)";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
// Fallback: CIK → company profile (used to confirm)
const PROFILE_URL = (cik10: string) => `https://data.sec.gov/submissions/CIK${cik10}.json`;

type Entry = { cik_str: number; ticker: string; title: string };

let cache: { when: number; data: Entry[] } | null = null;

async function loadTickers(): Promise<Entry[]> {
  const now = Date.now();
  // cache 6 hours
  if (cache && now - cache.when < 6 * 60 * 60 * 1000) return cache.data;

  const r = await fetch(TICKERS_URL, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC tickers fetch failed (${r.status})`);
  const j = await r.json(); // { "0": {ticker, cik_str, title}, ... }
  const entries: Entry[] = Object.values(j as any);
  cache = { when: now, data: entries };
  return entries;
}

// pad to 10
const padCIK = (n: number | string) => String(n).padStart(10, "0");

export async function GET(
  _req: Request,
  { params }: { params: { symbol: string } }
) {
  try {
    const qRaw = (params.symbol || "").trim();
    if (!qRaw) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

    const q = qRaw.toLowerCase();

    // If it's already a 10-digit CIK
    if (/^\d{10}$/.test(q)) {
      const cik10 = q;
      // optional: confirm exists
      try {
        const prof = await fetch(PROFILE_URL(cik10), {
          headers: { "User-Agent": UA, Accept: "application/json" },
          cache: "no-store",
        });
        if (prof.ok) {
          const j = await prof.json();
          return NextResponse.json({
            cik: cik10,
            ticker: j?.tickers?.[0] || null,
            name: j?.name || j?.entityType || "Company",
          });
        }
      } catch {}
      return NextResponse.json({ cik: cik10 });
    }

    const data = await loadTickers();

    // 1) exact ticker (case-insensitive), accept dots like BRK.B
    let found =
      data.find((e) => e.ticker.toLowerCase() === q) ||
      // allow user to type with/without dot or hyphen
      data.find((e) => e.ticker.toLowerCase().replace(/[.\-]/g, "") === q.replace(/[.\-]/g, ""));

    // 2) startsWith ticker (if user typed partial like "nv")
    if (!found) {
      found = data.find((e) => e.ticker.toLowerCase().startsWith(q));
    }

    // 3) company name contains
    if (!found) {
      found = data.find((e) => e.title.toLowerCase().includes(q));
    }

    if (!found) {
      return NextResponse.json(
        { error: "Not found. Try exact ticker (NVDA) or company name (NVIDIA)." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      cik: padCIK(found.cik_str),
      ticker: found.ticker,
      name: found.title,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Lookup error" }, { status: 500 });
  }
}
