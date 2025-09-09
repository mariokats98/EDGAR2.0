import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UA = process.env.SEC_USER_AGENT ?? "Herevna/1.0 (contact@herevna.io)";

// Trim leading/trailing slashes
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

/**
 * GET /api/census/variables?dataset=acs/acs5&year=latest
 * GET /api/census/variables?dataset=timeseries/eits/marts
 *
 * - Annual datasets live at: /data/{YEAR}/{DATASET}/variables.json
 * - Timeseries datasets live at: /data/{DATASET}/variables.json
 *
 * This route auto-falls back for annual datasets:
 * currentYear → currentYear-1 → ... → currentYear-10
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const datasetRaw = (searchParams.get("dataset") || "").trim();
    let yearRaw = (searchParams.get("year") || "").trim();

    if (!datasetRaw) {
      return NextResponse.json(
        { error: "Missing required query param: dataset" },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const dataset = cleanDataset(datasetRaw);
    const isTimeseries = dataset.startsWith("timeseries/");
    const base = "https://api.census.gov/data";

    // TIMESERIES: no year in the path
    if (isTimeseries) {
      const url = `${base}/${dataset}/variables.json`;
      const r = await fetch(url, {
        cache: "no-store",
        headers: { "User-Agent": UA },
      });
      if (!r.ok) {
        let detail = "";
        try { detail = await r.text(); } catch {}
        return NextResponse.json(
          { error: `Census variables fetch failed (${r.status})`, detail, tried: [url] },
          { status: 502, headers: noStoreHeaders() }
        );
      }
      const json = await r.json();
      return NextResponse.json(json, { status: 200, headers: noStoreHeaders() });
    }

    // ANNUAL: resolve year → fall back if needed
    const now = new Date().getFullYear();
    const requested =
      !yearRaw || yearRaw.toLowerCase() === "latest"
        ? now
        : parseInt(yearRaw, 10);

    const tried: string[] = [];
    for (let y = requested, i = 0; i <= 10 && y >= 2013; y--, i++) {
      const url = `${base}/${y}/${dataset}/variables.json`;
      tried.push(url);
      const r = await fetch(url, {
        cache: "no-store",
        headers: { "User-Agent": UA },
      });
      if (r.ok) {
        const json = await r.json();
        return NextResponse.json(json, {
          status: 200,
          headers: noStoreHeaders({ "X-Census-Resolved-Year": String(y) }),
        });
      }
      // continue probing on 404/400; fail early on 5xx
      if (r.status >= 500) {
        let detail = "";
        try { detail = await r.text(); } catch {}
        return NextResponse.json(
          { error: `Census variables fetch failed (${r.status})`, detail, tried },
          { status: 502, headers: noStoreHeaders() }
        );
      }
    }

    return NextResponse.json(
      {
        error:
          "Census variables fetch failed: no available vintage found within the last ~10 years.",
        tried,
      },
      { status: 404, headers: noStoreHeaders() }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}