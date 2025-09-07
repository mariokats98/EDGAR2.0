import { NextResponse } from "next/server";
import schedule from "@/app/data/bls_schedule.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bls/releases
 * GET /api/bls/releases?withLatest=1
 *
 * Returns: { data: [{ code,name,series,typical_time_et,next_release, latest? }] }
 */

const BLS_API = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

async function fetchLatest(series: string, apiKey?: string) {
  const body: any = {
    seriesid: [series],
    startyear: "2024",
    endyear: new Date().getFullYear().toString(),
  };
  if (apiKey) body.registrationkey = apiKey;

  const r = await fetch(BLS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const j = await r.json();
  const arr = j?.Results?.series?.[0]?.data || [];
  if (!arr.length) return null;
  // newest first in BLS
  const d = arr[0];
  const period = d.period as string;
  const year = d.year as string;
  const date = period.startsWith("M") ? `${year}-${period.slice(1)}-01` : `${year}-07-01`;
  return { date, value: Number(d.value) };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url, "http://local");
    const withLatest = (url.searchParams.get("withLatest") || "0") === "1";
    const apiKey = process.env.BLS_API_KEY;

    if (!withLatest) {
      return NextResponse.json({ data: schedule }, { status: 200 });
    }

    const results = await Promise.all(
      schedule.map(async (row) => {
        let latest: { date: string; value: number } | null = null;
        try {
          latest = await fetchLatest(row.series, apiKey);
        } catch {}
        return { ...row, latest };
      })
    );

    return NextResponse.json({ data: results }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

