// app/api/fred/series/route.ts
import { NextResponse } from "next/server";

const MUST = "Missing FRED_API_KEY (set it in Vercel → Project → Settings → Env Vars)";

function fredURL(path: string, params: Record<string, string>) {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error(MUST);
  const qs = new URLSearchParams({ ...params, file_type: "json", api_key: key });
  return `https://api.stlouisfed.org/fred${path}?${qs.toString()}`;
}

async function getMeta(series_id: string) {
  const url = fredURL("/series", { series_id });
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Meta fetch failed ${r.status}`);
  const j = await r.json();
  const s = (j?.seriess || [])[0];
  if (!s) throw new Error("Series not found");
  return {
    id: s.id,
    title: s.title,
    units: s.units,
    seasonal: s.seasonal_adjustment_short, // SA/NSA
    frequency: s.frequency_short,
  };
}

async function getObservations(series_id: string, start?: string, end?: string, freq?: string) {
  const params: Record<string, string> = { series_id, limit: "20000" };
  if (start) params.observation_start = start;
  if (end) params.observation_end = end;
  if (freq) params.frequency = freq; // 'm','q','a','d','w' etc.

  const url = fredURL("/series/observations", params);
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Obs fetch failed ${r.status}`);
  const j = await r.json();

  const observations = (j?.observations || [])
    .map((o: any) => {
      const v = parseFloat(o.value);
      return (isFinite(v) ? { date: o.date, value: v } : null);
    })
    .filter(Boolean);

  const latest = observations.length ? observations[observations.length - 1] : null;

  return { observations, latest };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = (searchParams.get("ids") || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!ids.length) return NextResponse.json({ data: [] }, { headers: { "Cache-Control": "no-store" } });

    const start = searchParams.get("start") || undefined; // e.g., 2000-01-01
    const end = searchParams.get("end") || undefined;     // e.g., 2025-12-31
    const freq = searchParams.get("freq") || undefined;   // 'm','q','a','d','w'

    const out = await Promise.all(ids.map(async (id) => {
      const meta = await getMeta(id);
      const obs = await getObservations(id, start, end, freq);
      return { ...meta, ...obs };
    }));

    return NextResponse.json({ data: out }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "FRED error" }, { status: 500 });
  }
}

