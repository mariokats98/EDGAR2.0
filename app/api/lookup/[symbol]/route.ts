import { NextRequest, NextResponse } from "next/server";

type Entry = { cik: string; ticker?: string; title: string };

let CACHE: Entry[] | null = null;
let LAST = 0;

async function loadSECIndex(): Promise<Entry[]> {
  const now = Date.now();
  if (CACHE && now - LAST < 1000 * 60 * 60) return CACHE; // 1h

  const url = "https://www.sec.gov/files/company_tickers.json";
  const r = await fetch(url, {
    headers: {
      "User-Agent": process.env.SEC_USER_AGENT || "herevna.io contact@herevna.io",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC tickers fetch failed (${r.status})`);
  const j = await r.json();

  const out: Entry[] = [];
  for (const k of Object.keys(j)) {
    const row = j[k];
    const cik = String(row.cik_str).padStart(10, "0");
    const ticker = row.ticker ? String(row.ticker).toUpperCase() : undefined;
    const title = String(row.title || "").trim();
    out.push({ cik, ticker, title });
  }
  CACHE = out;
  LAST = now;
  return out;
}

function normTickerLike(q: string) {
  // normalize BRK.B -> BRK.B and BRK-B variants check later
  return q.toUpperCase().replace(/\s+/g, "");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const raw = decodeURIComponent(params.symbol || "").trim();
    if (!raw) return NextResponse.json({ error: "Empty query" }, { status: 400 });

    // If a plain numeric CIK comes in, accept it
    if (/^\d{1,10}$/.test(raw)) {
      return NextResponse.json({
        kind: "cik",
        cik: raw.padStart(10, "0"),
        title: raw.padStart(10, "0"),
      });
    }

    const list = await loadSECIndex();

    // If the client pasted "NVDA — NVIDIA CORPORATION" from the suggest UI
    const beforeDash = raw.split("—")[0].trim();
    const qTicker = normTickerLike(beforeDash);
    const qName = raw.toLowerCase();

    // 1) exact ticker match
    let hits = list.filter((x) => x.ticker === qTicker);

    // 2) common alt ticker style: BRK.B vs BRK-B
    if (hits.length === 0 && qTicker.includes(".")) {
      const alt = qTicker.replace(".", "-");
      hits = list.filter((x) => x.ticker === alt);
    }
    if (hits.length === 0 && qTicker.includes("-")) {
      const alt = qTicker.replace("-", ".");
      hits = list.filter((x) => x.ticker === alt);
    }

    // 3) loose ticker contains
    if (hits.length === 0) {
      hits = list.filter((x) => x.ticker && x.ticker.includes(qTicker));
    }

    // 4) name contains
    if (hits.length === 0) {
      hits = list.filter((x) => x.title.toLowerCase().includes(qName));
    }

    if (hits.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // prefer the shortest/cleanest name if multiple
    hits.sort((a, b) => a.title.length - b.title.length);

    const best = hits[0];
    return NextResponse.json({
      kind: "cik",
      cik: best.cik,
      ticker: best.ticker,
      title: best.title,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}