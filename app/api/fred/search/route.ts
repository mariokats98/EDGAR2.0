// app/api/fred/search/route.ts
import { NextResponse } from "next/server";

const MUST = "Missing FRED_API_KEY (set it in Vercel → Project → Settings → Env Vars)";

function fredURL(path: string, params: Record<string, string>) {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error(MUST);
  const qs = new URLSearchParams({ ...params, file_type: "json", api_key: key });
  return `https://api.stlouisfed.org/fred${path}?${qs.toString()}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(25, Math.max(5, Number(searchParams.get("limit") || 15)));
    if (!q) return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });

    const url = fredURL("/series/search", {
      search_text: q,
      limit: String(limit),
      order_by: "popularity",
      sort_order: "desc",
    });

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`FRED search failed ${r.status}`);
    const j = await r.json();

    const results = (j?.seriess || []).map((s: any) => ({
      id: s.id,
      title: s.title,
      frequency: s.frequency_short,
      units: s.units_short,
      seasonal: s.seasonal_adjustment_short, // SA / NSA
      observation_start: s.observation_start,
      observation_end: s.observation_end,
      popularity: s.popularity,
    }));

    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Search error" }, { status: 500 });
  }
}

