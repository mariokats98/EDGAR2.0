// app/api/suggest/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

type Row = { ticker: string; cik: string; name: string };

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT || "herevna.io (contact@herevna.io)";

// ---------- helpers ----------
async function loadLocalTickerMap(): Promise<Row[]> {
  try {
    // Read from app/data/tickerMap.json if it exists
    const p = path.join(process.cwd(), "app", "data", "tickerMap.json");
    const raw = await fs.readFile(p, "utf8");
    const json = JSON.parse(raw);
    const out: Row[] = [];

    if (Array.isArray(json)) {
      for (const r of json as any[]) {
        const t = String(r.ticker || r.symbol || "").toUpperCase();
        const cik = String(r.cik || r.CIK || "").padStart(10, "0");
        const name = String(r.name || r.title || r.company || "").trim();
        if (t || (cik && name)) out.push({ ticker: t, cik, name });
      }
    } else if (json && typeof json === "object") {
      for (const [k, v] of Object.entries(json as Record<string, any>)) {
        const t = k.toUpperCase();
        if (typeof v === "string") {
          out.push({ ticker: t, cik: v.padStart(10, "0"), name: "" });
        } else {
          out.push({
            ticker: t,
            cik: String((v as any).cik || "").padStart(10, "0"),
            name: String((v as any).name || "").trim(),
          });
        }
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
  } catch {
    // File not found or unreadable — return empty list (non-fatal)
    return [];
  }
}

async function fetchSecLive(): Promise<Row[]> {
  try {
    const r = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) return [];
    const j = (await r.json()) as Record<
      string,
      { cik_str: number; ticker: string; title: string }
    >;
    return Object.values(j).map((x) => ({
      ticker: String(x.ticker || "").toUpperCase(),
      cik: String(x.cik_str || "").padStart(10, "0"),
      name: String(x.title || "").trim(),
    }));
  } catch {
    return [];
  }
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

async function ensureIndex(): Promise<Row[]> {
  if (CACHE) return CACHE;
  const local = await loadLocalTickerMap();
  const live = await fetchSecLive();
  const all = [...local, ...live];

  // unique by (ticker|cik)
  const seen = new Set<string>();
  CACHE = all.filter((r) => {
    const k = `${r.ticker}|${r.cik}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return CACHE;
}

// ---------- route ----------
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ data: [] });

  const index = await ensureIndex();

  const scored = index
    .map((r) => ({ r, s: score(q, r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map(({ r }) => r);

  return NextResponse.json({ data: scored });
}
