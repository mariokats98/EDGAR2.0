import { NextResponse } from "next/server";

/**
 * GET /api/census/data?dataset=acs/acs5&vintage=2022&get=NAME,B01001_001E&for=state:*
 * Optional: in=state:06, year=2022, filters=encodedPairs
 * - Adds your CENSUS_API_KEY automatically.
 */
export async function GET(req: Request) {
  try {
    const key = process.env.CENSUS_API_KEY || "";
    if (!key) return NextResponse.json({ error: "Missing CENSUS_API_KEY env var." }, { status: 500 });

    const u = new URL(req.url);
    const dataset = (u.searchParams.get("dataset") || "acs/acs5").trim();
    const rawVintage = (u.searchParams.get("vintage") || "2022").trim();
    const get = u.searchParams.get("get") || "NAME,B01001_001E";
    const forClause = u.searchParams.get("for") || "state:*";
    const inClause = u.searchParams.get("in") || "";
    const year = u.searchParams.get("year") || ""; // some timeseries expect YEAR=
    const filters = u.searchParams.get("filters") || "";

    const isTimeseries = dataset.toLowerCase().startsWith("timeseries/");
    const base = isTimeseries
      ? `https://api.census.gov/data/${encodeURIComponent(dataset)}`
      : `https://api.census.gov/data/${encodeURIComponent(rawVintage)}/${encodeURIComponent(dataset)}`;

    const qp = new URLSearchParams();
    qp.set("get", get);
    qp.set("for", forClause);
    if (inClause) qp.set("in", inClause);
    if (year) qp.set("YEAR", year);
    qp.set("key", key);
    if (filters) {
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
        { error: `Census data fetch failed (${r.status})`, url, body: txt?.slice(0, 800) },
        { status: 502 }
      );
    }

    let rows: any[] = [];
    try {
      rows = JSON.parse(txt);
    } catch {
      return NextResponse.json({ error: "Non-JSON response from Census", url, body: txt?.slice(0, 800) }, { status: 502 });
    }
    if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ columns: [], data: [], url });

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