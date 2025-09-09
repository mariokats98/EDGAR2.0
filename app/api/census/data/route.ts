import { NextResponse } from "next/server";

/**
 * GET /api/census/data?dataset=...&get=...&for=...&year=...
 * - Annual datasets (e.g., acs/acs5): require year (or we try /latest + fallbacks) AND a "for=" geography.
 * - Timeseries datasets (e.g., timeseries/eits/marts): require "time=..." and DO NOT accept "for=".
 *   Optional extra filters (e.g., category_code=44X72) are passed through.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dataset = (searchParams.get("dataset") || "acs/acs5").trim();
  const get = (searchParams.get("get") || "NAME,B01001_001E").trim();
  const key = process.env.CENSUS_API_KEY || "";
  const isTimeseries = dataset.startsWith("timeseries/");

  if (!get) {
    return NextResponse.json({ ok: false, error: "Missing get parameters." }, { status: 400 });
  }

  // Collect pass-through params except reserved ones we manage explicitly
  const passthrough = new URLSearchParams();
  for (const [k, v] of searchParams.entries()) {
    if (["dataset", "get", "year", "for", "time"].includes(k)) continue;
    if (v) passthrough.set(k, v);
  }
  if (key) passthrough.set("key", key);
  passthrough.set("get", get);

  // TIMESERIES
  if (isTimeseries) {
    const time = (searchParams.get("time") || "").trim();
    if (!time) {
      return NextResponse.json(
        { ok: false, error: 'Timeseries datasets require a "time" parameter, e.g. time=from 2021-01 to 2025-12.' },
        { status: 400 }
      );
    }
    // Do NOT include "for" for timeseries; Census returns 400 if present
    passthrough.set("time", time);

    const url = `https://api.census.gov/data/${dataset}?${passthrough.toString()}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `Census timeseries fetch failed: ${r.status} ${r.statusText}`, detail: text.slice(0, 400) },
        { status: r.status }
      );
    }
    const json = await r.json();
    return NextResponse.json({ ok: true, data: json, used: url });
  }

  // ANNUAL (e.g., acs/acs5, acs/acs1, etc.)
  // Must include a geography "for=" (e.g., us:1, state:*, county:* etc.)
  const geoFor = (searchParams.get("for") || "us:1").trim();
  if (!geoFor) {
    return NextResponse.json({ ok: false, error: 'Annual datasets require a "for" geography, e.g., for=us:1.' }, { status: 400 });
  }
  passthrough.set("for", geoFor);

  // Resolve year path: use /latest if requested, then fall back
  const yearQ = (searchParams.get("year") || "latest").trim().toLowerCase();
  const bases: string[] = [];
  if (yearQ === "latest") {
    bases.push(`https://api.census.gov/data/latest/${dataset}`);
    const now = new Date().getFullYear();
    for (let y = now; y >= now - 6; y--) {
      bases.push(`https://api.census.gov/data/${y}/${dataset}`);
    }
  } else {
    bases.push(`https://api.census.gov/data/${yearQ}/${dataset}`);
  }

  let lastErr: any = null;
  for (const base of bases) {
    const url = `${base}?${passthrough.toString()}`;
    const r = await fetch(url, { cache: "no-store" });
    if (r.ok) {
      const json = await r.json();
      return NextResponse.json({ ok: true, data: json, used: url });
    }
    lastErr = `${r.status} ${r.statusText}`;
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Census annual fetch failed for all attempts.",
      detail: { dataset, year: yearQ, for: geoFor, tried: bases, lastErr },
    },
    { status: 502 }
  );
}