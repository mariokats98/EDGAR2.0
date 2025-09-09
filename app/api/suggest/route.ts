// app/api/suggest/route.ts
import { NextRequest, NextResponse } from "next/server";

const SEC_UA = process.env.SEC_USER_AGENT || "herevna/1.0 (contact@herevna.io)";

type TickerRecord = { cik_str: number; ticker: string; title: string };
let CACHE: { at: number; items: TickerRecord[] } | null = null;

const HEADERS = {
  "User-Agent": SEC_UA,
  Accept: "application/json; charset=utf-8",
} as const;

async function loadTickers(): Promise<TickerRecord[]> {
  const now = Date.now();
  if (CACHE && now - CACHE.at < 6 * 60 * 60 * 1000) return CACHE.items;
  const r = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: HEADERS,
    cache: "no-store",
  });
  if (!r.ok) return [];
  const j = (await r.json()) as Record<string, TickerRecord>;
  const items = Object.values(j);
  CACHE = { at: now, items };
  return items;
}

const norm = (s: string) => s.toLowerCase();
const normT = (s: string) => s.toUpperCase().replace(/[^\w.]/g, "");

export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ ok: true, data: [] }, { headers: { "Cache-Control": "no-store" } });

  // numeric CIK short-circuit
  if (/^\d{1,10}$/.test(q)) {
    const cik10 = q.padStart(10, "0");
    return NextResponse.json({
      ok: true,
      data: [{ label: `CIK ${cik10}`, sublabel: "Enter to use exact CIK", value: cik10, kind: "cik" }],
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const list = await loadTickers();
  if (!list.length) return NextResponse.json({ ok: true, data: [] }, { headers: { "Cache-Control": "no-store" } });

  const qTicker = normT(q), qName = norm(q);
  const ranked = list
    .map((x) => {
      const t = normT(x.ticker);
      const nm = norm(x.title);
      let score = -1;
      if (t.startsWith(qTicker)) score = 100 - t.length;
      else if (t.includes(qTicker)) score = 60 - (t.indexOf(qTicker) || 0);
      else if (nm.includes(qName)) score = 30 - (nm.indexOf(qName) || 0);
      return { score, x };
    })
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  const data = ranked.map(({ x }) => {
    const cik10 = String(x.cik_str).padStart(10, "0");
    return {
      label: `${x.ticker} — ${x.title}`,
      sublabel: `CIK ${cik10}`,
      value: cik10,       // always return CIK10
      alt: x.ticker,
      name: x.title,
      kind: "company",
    };
  });

  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
}