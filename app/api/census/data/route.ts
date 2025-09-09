import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UA = process.env.SEC_USER_AGENT ?? "Herevna/1.0 (contact@herevna.io)";

function cleanDataset(s: string) {
  return s.replace(/^\/+|\/+$/g, "");
}

function noStoreHeaders(extra?: Record<string, string>) {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    ...(extra || {}),
  };
}

async function findLatestAnnualVintage(dataset: string, startFromYear: number) {
  const base = "https://api.census.gov/data";
  const tried: string[] = [];
  for (let y = startFromYear, i = 0; i <= 10 && y >= 2013; y--, i++) {
    const url = `${base}/${y}/${dataset}/variables.json`;
    tried.push(url);
    const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": UA } });
    if (r.ok) return { year: y, tried };
    if (r.status >= 500) {
      let detail = "";
      try { detail = await r.text(); } catch {}
      throw new Error(`Census vintage probe failed (${r.status}) ${detail ? " - " + detail : ""}`);
    }
  }
  return { year: null as number | null, tried };
}

/**
 * GET /api/census/data
 *
 * Required:
 *  - dataset: "acs/acs5" OR "timeseries/eits/marts"
 *  - get: comma-separated columns (e.g., "NAME,B01001_001E")
 *  - for: geography (e.g., "us:1" or "state:*")
 *
 * Annual datasets:
 *  - year: "YYYY" or "latest"
 *
 * Timeseries datasets:
 *  - time: e.g., "from 2021-01 to 2025-12" or "2024-01"
 *
 * Pass-through predicates like `in=...` are supported.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const datasetRaw = (searchParams.get("dataset") || "").trim();
    const get = (searchParams.get("get") || "").trim();
    const geoFor = (searchParams.get("for") || "").trim();
    let yearRaw = (searchParams.get("year") || "").trim();
    const time = (searchParams.get("time") || "").trim();

    if (!datasetRaw) {
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

    const dataset = cleanDataset(datasetRaw);
    const isTimeseries = dataset.startsWith("timeseries/");
    const base = "https://api.census.gov/data";

    const qs = new URLSearchParams();
    qs.set("get", get);
    qs.set("for", geoFor);

    // Pass through extra predicates (e.g., in=..., ucgid=..., etc.)
    for (const [k, v] of searchParams.entries()) {
      if (["dataset", "get", "for", "year", "time"].includes(k)) continue;
      if (v != null && v !== "") qs.set(k, v);
    }

    const apiKey = process.env.CENSUS_API_KEY || "";
    if (apiKey) qs.set("key", apiKey);

    // TIMESERIES: use 'time'
    if (isTimeseries) {
      if (!time) {
        return NextResponse.json(
          { error: "Missing required query param: time for timeseries datasets" },
          { status: 400, headers: noStoreHeaders() }
        );
      }
      qs.set("time", time);
      const url = `${base}/${dataset}?${qs.toString()}`;
      const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": UA } });
      if (!r.ok) {
        let detail = "";
        try { detail = await r.text(); } catch {}
        return NextResponse.json(
          { error: `Census data fetch failed (${r.status})`, detail, source: url },
          { status: 502, headers: noStoreHeaders() }
        );
      }
      const data = await r.json();
      return NextResponse.json({ data, source: url }, { status: 200, headers: noStoreHeaders() });
    }

    // ANNUAL: resolve year (support `latest`)
    const now = new Date().getFullYear();
    let targetYear: number | null = null;
    if (!yearRaw || yearRaw.toLowerCase() === "latest") {
      const probe = await findLatestAnnualVintage(dataset, now);
      targetYear = probe.year;
      if (!targetYear) {
        return NextResponse.json(
          { error: "No annual vintage found within the last ~10 years.", dataset, tried: probe.tried },
          { status: 404, headers: noStoreHeaders() }
        );
      }
    } else {
      const y = parseInt(yearRaw, 10);
      if (!Number.isFinite(y)) {
        return NextResponse.json(
          { error: "Invalid year. Use 'YYYY' or 'latest'." },
          { status: 400, headers: noStoreHeaders() }
        );
      }
      targetYear = y;
    }

    const url = `${base}/${targetYear}/${dataset}?${qs.toString()}`;
    const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": UA } });
    if (!r.ok) {
      // If caller asked for 'latest', try falling back a few years on data as well
      if (!yearRaw || yearRaw.toLowerCase() === "latest") {
        for (let y = (targetYear ?? now) - 1, i = 0; i < 5 && y >= 2013; y--, i++) {
          const tryUrl = `${base}/${y}/${dataset}?${qs.toString()}`;
          const rr = await fetch(tryUrl, { cache: "no-store", headers: { "User-Agent": UA } });
          if (rr.ok) {
            const data = await rr.json();
            return NextResponse.json(
              { data, source: tryUrl, resolvedYear: y },
              { status: 200, headers: noStoreHeaders({ "X-Census-Resolved-Year": String(y) }) }
            );
          }
        }
      }
      let detail = "";
      try { detail = await r.text(); } catch {}
      return NextResponse.json(
        { error: `Census data fetch failed (${r.status})`, detail, source: url },
        { status: 502, headers: noStoreHeaders() }
      );
    }

    const data = await r.json();
    return NextResponse.json(
      { data, source: url, resolvedYear: targetYear },
      { status: 200, headers: noStoreHeaders({ "X-Census-Resolved-Year": String(targetYear) }) }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}