// app/api/suggest/route.ts
import { NextRequest, NextResponse } from "next/server";
import localMap from "../../data/tickerMap.json"; // make sure this exists

type Row = { ticker: string; cik: string; name: string };

const SEC_USER_AGENT = process.env.SEC_USER_AGENT || "herevna.io (contact@herevna.io)";

// Normalize local map into a flat array
function normalizeLocal(): Row[] {
  const out: Row[] = [];
  if (Array.isArray(localMap)) {
    for (const r of localMap as any[]) {
      const t = String(r.ticker || r.symbol || "").toUpperCase();
      const cik = String(r.cik || r.CIK || "").padStart(10, "0");
      const name = String(r.name || r.title || r.company || "").trim();
      if (t || (cik && name)) out.push({ ticker: t, cik, name });
    }
  } else if (localMap && typeof localMap === "object") {
    for (const [k, v] of Object.entries(localMap as Record<string, any>)) {
      const t = k.toUpperCase();
      if (typeof v === "string") out.push({ ticker: t, cik: v.padStart(10, "0"), name: "" });
      else out.push({ ticker: t, cik: String(v.cik || "").padStart(10, "0"), name: String(v.name || "").trim() });
    }
  }
  // de-dup
  const seen = new Set<string>();
  return out.filter((r) => {
    const key = `${r.ticker}|${r.cik}|${r.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function score(q: string, r: Row) {
  const s = q.toLowerCase();
  let sc = 0;
  if (r.ticker) {
    const t = r.ticker.toLowerCase();
    if (t === s) sc += 100;
    else if (t.startsWith(s)) sc += 60;
    else if (t.includes(s)) sc += 30;
  }
  if (r.name) {
    const n = r.name.toLowerCase();
    if (n === s) sc += 90;
    else if (n.startsWith(s)) sc += 55;
    else if (n.includes(s)) sc += 25;
  }
  return sc;
}

let CACHE: Row[] | null = null;

async function fetchSecLive(): Promise<Row[]> {
  const r = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) return [];
  const j = (await r.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
  return Object.values(j).map((x) => ({
    ticker: String(x.ticker || "").toUpperCase(),
    cik: String(x.cik_str || "").padStart(10, "0"),
    name: String(x.title || "").trim(),
  }));
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ data: [] });

  // Build a combined index once per cold start
  if (!CACHE) {
    const base = normalizeLocal();
    let live: Row[] = [];
    try { live = await fetchSecLive(); } catch {}
    const all = [...base, ...live];
    // unique by (ticker|cik)
    const seen = new Set<string>();
    CACHE = all.filter((r) => {
      const k = `${r.ticker}|${r.cik}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const scored = CACHE
    .map((r) => ({ r, s: score(q, r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map(({ r }) => r);

  return NextResponse.json({ data: scored });
}

