import { NextResponse } from "next/server";

const BEA_BASE = "https://apps.bea.gov/api/data";

/**
 * /api/bea?dataset=NIPA&table=T10101&freq=Q&year=2015,2016,2017 or year=ALL or year=LAST10
 * Optional: line=1 to suggest a default series to highlight (e.g., GDP headline).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dataset = url.searchParams.get("dataset") || "NIPA";
    const table = url.searchParams.get("table") || "T10101"; // GDP (current $) – good default for NIPA
    const freq = url.searchParams.get("freq") || "Q"; // Q or A (NIPA supports Q/A; some tables support M)
    const year = url.searchParams.get("year") || "LAST10"; // ALL | LAST10 | comma list
    const key = process.env.BEA_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "Missing BEA_API_KEY env var." }, { status: 500 });
    }

    // BEA GetData call
    const qs = new URLSearchParams({
      UserID: key,
      method: "GetData",
      datasetname: dataset,
      TableName: table,
      Frequency: freq,
      Year: year,
      ResultFormat: "JSON",
    });

    const upstream = `${BEA_BASE}/?${qs.toString()}`;
    const r = await fetch(upstream, { cache: "no-store" });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ error: `BEA data fetch failed (${r.status})`, details: text.slice(0, 500) }, { status: 502 });
    }

    const j = await r.json();
    const data = j?.BEAAPI?.Results?.Data || [];

    // Normalize: keep fields we need and coerce numbers when possible
    // Common fields: TimePeriod, DataValue, LineNumber, LineDescription, SeriesCode
    const rows = data.map((d: any) => ({
      time: d?.TimePeriod,
      value: toNumber(d?.DataValue),
      line: d?.LineNumber,
      lineDesc: d?.LineDescription,
      series: d?.SeriesCode || null,
      noteRef: d?.NoteRef || null,
      unit: d?.CL_UNIT || d?.Unit || null,
    }));

    return NextResponse.json({
      meta: { dataset, table, freq, year },
      rows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

function toNumber(x: unknown) {
  if (x == null) return null;
  const s = String(x).replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

