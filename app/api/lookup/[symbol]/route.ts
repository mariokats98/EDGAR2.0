import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { ticker: string; cik: string; name: string };

const SEC_HEADERS_BASE = {
  "User-Agent": process.env.SEC_USER_AGENT || "EDGARCards/1.0 (support@example.com)",
  Accept: "application/json",
};

function pad10(x: string | number) {
  const s = String(x ?? "").replace(/\D/g, "");
  return s.padStart(10, "0");
}
function norms(sym: string): string[] {
  const u = String(sym || "").toUpperCase().trim();
  const nodots = u.replace(/\./g, "");
  const dash = u.replace(/\./g, "-");
  const plain = u.replace(/[-.]/g, "");
  return Array.from(new Set([u, nodots, dash, plain]));
}

async function fetchJSON(url: string, headers: Record<string, string>) {
  let delay = 200;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers, cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      await new Promise((res) => setTimeout(res, delay));
      delay *= 2;
    }
  }
  throw new Error("fetch_failed");
}

let CACHE: Row[] | null = null;
let LAST = 0;
const TTL_MS = 60 * 60 * 1000;

async function loadAll(hostHint?: string): Promise<Row[]> {
  const now = Date.now();
  if (CACHE && now - LAST < TTL_MS) return CACHE;

  const SEC_HEADERS = {
    ...SEC_HEADERS_BASE,
    ...(hostHint ? { Referer: `https://${hostHint}` } : {}),
  };

  const j1 = await fetchJSON("https://www.sec.gov/files/company_tickers.json", SEC_HEADERS);
  const arr1: Row[] = Object.keys(j1).map((k) => ({
    ticker: String(j1[k].ticker || "").toUpperCase(),
    cik: pad10(j1[k].cik_str),
    name: String(j1[k].title || ""),
  }));

  let arr2: Row[] = [];
  try {
    const j2 = await fetchJSON("https://www.sec.gov/files/company_tickers_exchange.json", SEC_HEADERS);
    if (Array.isArray(j2)) {
      arr2 = j2.map((row: any) => ({
        ticker: String(row.ticker || "").toUpperCase(),
        cik: pad10(row.cik),
        name: String(row.title || ""),
      }));
    }
  } catch {}

  const byPlain = new Map<string, Row>();
  const push = (r: Row) => {
    for (const n of norms(r.ticker)) {
      const key = n.replace(/[-.]/g, "");
      if (!byPlain.has(key)) byPlain.set(key, r);
    }
  };
  arr2.forEach(push);
  arr1.forEach(push);

  CACHE = Array.from(byPlain.values());
  LAST = now;
  return CACHE;
}

export async function GET(req: Request, { params }: { params: { symbol: string } }) {
  try {
    const host = new URL(req.url).host;
    const list = await loadAll(host);
    const q = (params.symbol || "").trim();
    if (!q) return NextResponse.json({ error: "empty_query" }, { status: 400 });

    if (/^\d{1,10}$/.test(q)) {
      const cik = pad10(q);
      const hit = list.find((r) => r.cik === cik);
      if (hit) return NextResponse.json(hit);
    }

    const Q = q.toUpperCase();
    const qPlainSet = new Set(norms(Q).map((v) => v.replace(/[-.]/g, "")));

    let hit =
      list.find((x) => {
        const xs = norms(x.ticker).map((v) => v.replace(/[-.]/g, ""));
        return xs.some((v) => qPlainSet.has(v));
      }) || null;

    if (!hit) hit = list.find((x) => x.name.toUpperCase().startsWith(Q)) || null;
    if (!hit) hit = list.find((x) => x.name.toUpperCase().includes(Q)) || null;

    if (!hit) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(hit);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "lookup_failed" }, { status: 500 });
  }
}
