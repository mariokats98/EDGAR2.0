// app/api/census/variables/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
  };
}

/**
 * GET /api/census/variables?dataset=acs/acs5&year=latest
 * GET /api/census/variables?dataset=timeseries/eits/marts
 *
 * For annual datasets (like acs/acs5), the path is /data/{year}/{dataset}/variables.json
 * For timeseries datasets (like timeseries/eits/marts), it's /data/{dataset}/variables.json
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dataset = (searchParams.get("dataset") || "").trim();
    let year = (searchParams.get("year") || "").trim();

    if (!dataset) {
      return NextResponse.json(
        { error: "Missing required query param: dataset" },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    // Resolve "latest" year for annual datasets
    if (year.toLowerCase() === "latest") {
      year = String(new Date().getFullYear());
    }

    // Build Census endpoint
    const isTimeseries = dataset.startsWith("timeseries/");
    const base = "https://api.census.gov/data";
    const url = isTimeseries
      ? `${base}/${dataset}/variables.json`
      : `${base}/${year || new Date().getFullYear()}/${dataset}/variables.json`;

    const r = await fetch(url, {
      cache: "no-store",
      // Avoid leaking your API key on this endpoint; variables.json doesn’t need a key
      headers: { "User-Agent": process.env.SEC_USER_AGENT ?? "Herevna/1.0 (contact@herevna.io)" },
    });

    if (!r.ok) {
      return NextResponse.json(
        { error: `Census variables fetch failed (${r.status})` },
        { status: 502, headers: noStoreHeaders() }
      );
    }

    const json = await r.json();
    return NextResponse.json(json, { status: 200, headers: noStoreHeaders() });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}