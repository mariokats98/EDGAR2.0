import { NextResponse } from "next/server";

/**
 * GET /api/census/variables?dataset=acs/acs5&year=latest
 * - For timeseries datasets: /data/{timeseries/...}/variables.json (no year)
 * - For annual datasets: tries /data/latest/{dataset}/variables.json; then
 *   falls back through recent numeric years until one works.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dataset = (searchParams.get("dataset") || "acs/acs5").trim();
  const yearQ = (searchParams.get("year") || "latest").trim().toLowerCase();
  const isTimeseries = dataset.startsWith("timeseries/");

  // Build candidate URLs to try in order
  const tries: string[] = [];
  if (isTimeseries) {
    // timeseries never has year in the path
    tries.push(`https://api.census.gov/data/${dataset}/variables.json`);
  } else {
    if (yearQ === "latest") {
      tries.push(`https://api.census.gov/data/latest/${dataset}/variables.json`);
      const now = new Date().getFullYear();
      for (let y = now; y >= now - 6; y--) {
        tries.push(`https://api.census.gov/data/${y}/${dataset}/variables.json`);
      }
    } else {
      tries.push(`https://api.census.gov/data/${yearQ}/${dataset}/variables.json`);
    }
  }

  let lastErr: any = null;
  for (const url of tries) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        lastErr = `${r.status} ${r.statusText}`;
        continue;
      }
      const json = await r.json();
      return NextResponse.json({ ok: true, data: json, used: url });
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Census variables fetch failed.",
      detail: { dataset, year: yearQ, tried: tries, lastErr },
    },
    { status: 502 }
  );
}