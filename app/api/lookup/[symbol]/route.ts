// app/api/lookup/[symbol]/route.ts
import { NextResponse } from "next/server";
const UA = process.env.SEC_USER_AGENT || "HerevnaBot/1.0 (admin@herevna.io)";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const PROFILE_URL = (cik10: string) => `https://data.sec.gov/submissions/CIK${cik10}.json`;

type Entry = { cik_str: number; ticker: string; title: string };
let cache: { when: number; data: Entry[] } | null = null;

async function loadTickers(): Promise<Entry[]> {
  const now = Date.now();
  if (cache && now - cache.when < 6 * 60 * 60 * 1000) return cache.data;
  const r = await fetch(TICKERS_URL, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`SEC tickers fetch failed (${r.status})`);
  const j = await r.json();
  const entries: Entry[] = Object.values(j as any);
  cache = { when: now, data: entries };
  return entries;
}

const padCIK = (x: string | number) => String(x).padStart(10, "0");
const norm = (s: string) => s.toLowerCase().replace(/[.\- ]/g, "");

export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  try {
    const raw = (params.symbol || "").trim();
    if (!raw) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
    const q = raw.toLowerCase();

    // Already a CIK?
    if (/^\d{10}$/.test(q)) {
      const cik10 = q;
      try {
        const pr = await fetch(PROFILE_URL(cik10), { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
        if (pr.ok) {
          const j = await pr.json();
          return NextResponse.json({ cik: cik10, ticker: j?.tickers?.[0] || null, name: j?.name || "Company" });
        }
      } catch {}
      return NextResponse.json({ cik: cik10 });
    }

    const data = await loadTickers();
    const nq = norm(q);
    const best =
      data.find((e) => norm(e.ticker) === nq) ||
      data.find((e) => norm(e.ticker).startsWith(nq)) ||
      data.find((e) => e.title.toLowerCase().includes(q));

    if (!best) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      cik: padCIK(best.cik_str),
      ticker: best.ticker,
      name: best.title,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Lookup error" }, { status: 500 });
  }
}
