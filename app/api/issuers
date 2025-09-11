// app/api/issuers/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const UA = {
  "User-Agent": "Herevna.io (contact@herevna.io)",
  "Accept-Encoding": "gzip, deflate",
};

type Issuer = { cik: string; ticker: string; name: string };

function normalizeSEC(data: any): Issuer[] {
  // SEC format: { 0:{cik_str:..., ticker:..., title:...}, 1:{...}, ... }
  const out: Issuer[] = [];
  if (!data || typeof data !== "object") return out;
  for (const k of Object.keys(data)) {
    const row = data[k];
    if (!row) continue;
    const cik = String(row.cik_str || row.cik || "").padStart(10, "0");
    const ticker = String(row.ticker || "").toUpperCase();
    const name = String(row.title || row.name || "").trim();
    if (cik && (ticker || name)) out.push({ cik, ticker, name });
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const perPage = Math.min(Math.max(parseInt(searchParams.get("perPage") || "50", 10), 10), 200);

    // Fetch SEC list (cached by Vercel edge/node for ~1 day using revalidate)
    const url = "https://www.sec.gov/files/company_tickers.json";
    const r = await fetch(url, {
      headers: UA,
      cache: "no-store", // always fresh server-side, we’ll soft-paginate in-memory
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: `SEC list fetch failed (${r.status})` }, { status: 502 });
    }
    const raw = await r.json();
    const all = normalizeSEC(raw);

    const filtered = q
      ? all.filter((x) =>
          x.ticker.toLowerCase().includes(q) ||
          x.name.toLowerCase().includes(q) ||
          x.cik.includes(q.replace(/\D/g, ""))
        )
      : all;

    const total = filtered.length;
    const start = (page - 1) * perPage;
    const data = filtered.slice(start, start + perPage);

    return NextResponse.json({ ok: true, total, page, perPage, data }, {
      // downstream caches may keep this for a day
      headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=86400" },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}