// app/api/suggest/route.ts
import { NextRequest, NextResponse } from "next/server";

const SEC_UA =
  process.env.SEC_USER_AGENT || "herevna/1.0 (contact@herevna.io)";

type TickerRecord = {
  cik_str: number;
  ticker: string;
  title: string;
};

let CACHE: { at: number; items: TickerRecord[] } | null = null;

const HEADERS = {
  "User-Agent": SEC_UA,
  Accept: "application/json; charset=utf-8",
} as const;

async function loadTickers(): Promise<TickerRecord[]> {
  const now = Date.now();
  if (CACHE && now - CACHE.at < 6 * 60 * 60 * 1000) return CACHE.items;

  const url = "https://www.sec.gov/files/company_tickers.json";
  const r = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!r.ok) {
    return []; // Fail soft; UI will show "No suggestions"
  }
  const j = (await r.json()) as Record<
    string,
    { cik_str: number; ticker: string; title: string }
  >;
  const items = Object.values(j);
  CACHE = { at: now, items };
  return items;
}

function norm(s: string) {
  return s.toLowerCase();
}
function normTicker(s: string) {
  return s.toUpperCase().replace(/[^\w.]/g, "");
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    if (!q) return NextResponse.json({ ok: true, data: [] }, { headers: { "Cache-Control": "no-store" } });

    // If the user typed a numeric CIK, short-circuit with that
    if (/^\d{1,10}$/.test(q)) {
      const cik10 = q.padStart(10, "0");
      return NextResponse.json({
        ok: true,
        data: [
          {
            label: `CIK ${cik10}`,
            sublabel: "Enter to use exact CIK",
            value: cik10,
            kind: "cik",
          },
        ],
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const list = await loadTickers();
    if (!list.length) {
      return NextResponse.json({ ok: true, data: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const qTicker = normTicker(q);
    const qName = norm(q);

    // Rank: ticker prefix, then ticker contains, then name contains
    const scored = list
      .map((x) => {
        const t = normTicker(x.ticker);
        const nm = norm(x.title);
        let score = -1;

        if (t.startsWith(qTicker)) score = 100 - t.length; // shorter ticker slightly higher
        else if (t.includes(qTicker)) score = 50 - (t.indexOf(qTicker) || 0);
        else if (nm.includes(qName)) score = 10 - (nm.indexOf(qName) || 0);

        return { score, rec: x };
      })
      .filter((s) => s.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    const out = scored.map(({ rec }) => {
      const cik10 = String(rec.cik_str).padStart(10, "0");
      return {
        label: `${rec.ticker} — ${rec.title}`,
        sublabel: `CIK ${cik10}`,
        value: cik10,          // we return CIK so downstream is 100% reliable
        alt: rec.ticker,       // keep ticker around if you need it
        name: rec.title,
        kind: "company",
      };
    });

    return NextResponse.json({ ok: true, data: out }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: true, data: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}