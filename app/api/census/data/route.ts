// app/api/census/data/route.ts
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
 * GET /api/census/data
 * Required:
 *  - dataset: e.g., "acs/acs5" OR "timeseries/eits/marts"
 *  - get: comma-separated list, e.g., "NAME,B01001_001E"
 *  - for: geography, e.g., "us:1" or "state:*"
 *  - (annual dataset) year: "2023" or "latest"
 *  - (timeseries dataset) time: e.g., "from 2018-01 to 2025-12" OR "2024-01"
 * Optional:
 *  - Any additional Census predicates: e.g., "in=metropolitan%20statistical%20area/micropolitan%20statistical%20area:*"
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const dataset = (searchParams.get("dataset") || "").trim();
    const get = (searchParams.get("get") || "").trim();
    const geoFor = (searchParams.get("for") || "").trim();
    let year = (searchParams.get("year") || "").trim(); // for annual datasets
    const time = (searchParams.get("time") || "").trim(); // for timeseries datasets

    if (!dataset) {
      return NextResponse.json(
        { error: "Missing required query param: dataset" },
        { status: 400, headers: noStoreHeaders() }
      );
    }
    if (!get) {
      return NextResponse.json(
        { error: "Missing required query param: get" },
        { status: 400, headers: noStoreHeaders() }
      );
    }
    if (!geoFor) {
      return NextResponse.json(
        { error: "Missing required query param: for" },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    // Resolve "latest" for year if given
    if (year.toLowerCase() === "latest") {
      year = String(new Date().getFullYear());
    }

    const isTimeseries = dataset.startsWith("timeseries/");
    const base = "https://api.census.gov/data";

    // Build query string
    const qs = new URLSearchParams();
    qs.set("get", get);
    qs.set("for", geoFor);

    // Pass through any additional predicates (e.g. `in=...` or `ucgid=...`)
    for (const [k, v] of searchParams.entries()) {
      if (["dataset", "get", "for", "year", "time"].includes(k)) continue;
      if (v != null && v !== "") qs.set(k, v);
    }

    // API key (recommended for production)
    const apiKey = process.env.CENSUS_API_KEY || "";
    if (apiKey) qs.set("key", apiKey);

    // Path differs by dataset type
    let url: string;
    if (isTimeseries) {
      if (!time) {
        return NextResponse.json(
          { error: "Missing required query param: time for timeseries datasets" },
          { status: 400, headers: noStoreHeaders() }
        );
      }
      qs.set("time", time);
      url = `${base}/${dataset}?${qs.toString()}`;
    } else {
      if (!year) {
        return NextResponse.json(
          { error: "Missing required query param: year for annual datasets" },
          { status: 400, headers: noStoreHeaders() }
        );
      }
      url = `${base}/${year}/${dataset}?${qs.toString()}`;
    }

    const r = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": process.env.SEC_USER_AGENT ?? "Herevna/1.0 (contact@herevna.io)" },
    });

    if (!r.ok) {
      // Bubble upstream error body for easier debugging when possible
      let detail = "";
      try { detail = await r.text(); } catch {}
      return NextResponse.json(
        { error: `Census data fetch failed (${r.status})`, detail },
        { status: 502, headers: noStoreHeaders() }
      );
    }

    const data = await r.json();
    return NextResponse.json({ data, source: url }, { status: 200, headers: noStoreHeaders() });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}