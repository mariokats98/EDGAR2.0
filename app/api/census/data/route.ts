import { NextResponse } from "next/server";

/**
 * GET /api/census/data?dataset=acs/acs5&vintage=2022&get=NAME,B01001_001E&for=state:* 
 * Optional: &in=county:*&year=2022 (for timeseries datasets you might not need vintage)
 * You can also pass &filters=... to append extra query pairs (URL encoded).
 *
 * This proxy adds your CENSUS_API_KEY and returns JSON rows + columns.
 */
export async function GET(req: Request) {
  try {
    const key = process.env.CENSUS_API_KEY || "";
    if (!key) {
      return NextResponse.json({ error: "Missing CENSUS_API_KEY env var." }, { status: 500 });
    }

    const u = new URL(req.url);
    const dataset = u.searchParams.get("dataset") || "acs/acs5";
    const vintage = u.searchParams.get("vintage") || "2022";
    const get = u.searchParams.get("get") || "NAME,B01001_001E";
    const forClause = u.searchParams.get("for") || "state:*";
    const inClause = u.searchParams.get("in") || ""; // optional, e.g. "state:06"
    const year = u.searchParams.get("year"); // optional if dataset requires it
    const filters = u.searchParams.get("filters"); // "key1=val1&key2=val2" (already encoded)

    // Base path (some timeseries datasets don’t use a vintage year in the path):
    const base =
      vintage.toLowerCase() === "none"
        ? `https://api.census.gov/data/${encodeURIComponent(dataset)}`
        : `https://api.census.gov/data/${encodeURIComponent(vintage)}/${encodeURIComponent(
            dataset
          )}`;

    const qp = new URLSearchParams();
    qp.set("get", get);
    qp.set("for", forClause);
    if (inClause) qp.set("in", inClause);
    if (year) qp.set("YEAR", year); // some series expect YEAR parameter
    qp.set("key", key);
    if (filters) {
      // append extra pairs
      for (const part of filters.split("&")) {
        const [k, v] = part.split("=");
        if (k && v) qp.append(k, v);
      }
    }

    const url = `${base}?${qp.toString()}`;
    const r = await fetch(url, { cache: "no-store" });
    const txt = await r.text();

    if (!r.ok) {
      return NextResponse.json(
        { error: `Census data fetch failed (${r.status})`, body: txt },
        { status: 502 }
      );
    }

    // Census returns an array-of-arrays: first row = column names
    let rows: any[] = [];
    try {
      rows = JSON.parse(txt);
    } catch {
      return NextResponse.json(
        { error: "Unexpected response from Census (not JSON)", body: txt.slice(0, 4000) },
        { status: 502 }
      );
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ columns: [], data: [] });
    }

    const columns = rows[0];
    const data = rows.slice(1).map((arr: any[]) => {
      const obj: Record<string, any> = {};
      for (let i = 0; i < columns.length; i++) obj[columns[i]] = arr[i];
      return obj;
    });

    return NextResponse.json({ columns, data, url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}