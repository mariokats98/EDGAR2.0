// app/api/bea/route.ts
import { NextResponse } from "next/server";

const BEA_BASE = "https://apps.bea.gov/api/data";

/**
 * Flexible BEA fetch:
 * - /api/bea?dataset=NIPA&param=TableName&value=T10101&freq=Q&year=LAST10
 * - /api/bea?dataset=ITA&param=Indicator&value=BalGds&year=ALL
 * Back-compat:
 * - /api/bea?dataset=NIPA&table=T10101&freq=Q&year=LAST10  (assumes param=TableName)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dataset = url.searchParams.get("dataset") || "NIPA";

    // New flexible way
    let param = url.searchParams.get("param");
    let value = url.searchParams.get("value");

    // Back-compat for older UI (table=… => TableName)
    const table = url.searchParams.get("table");
    if (!param && table) {
      param = "TableName";
      value = table;
    }

    const freq = url.searchParams.get("freq") || ""; // some datasets don’t need this
    const year = url.searchParams.get("year") || "LAST10";

    const key = process.env.BEA_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "Missing BEA_API_KEY env var." }, { status: 500 });
    }
    if (!param || !value) {
      return NextResponse.json({ error: "Missing selector: provide param and value (or table)." }, { status: 400 });
    }

    // Build GetData query dynamically
    const qs = new URLSearchParams({
      UserID: key,
      method: "GetData",
      datasetname: dataset,
      ResultFormat: "JSON",
      Year: year,
    });
    // Only include Frequency if user set one
    if (freq) qs.set("Frequency", freq);
    // Put the selector the dataset expects (TableName/Indicator/TableID/etc.)
    qs.set(param, value);

    const upstream = `${BEA_BASE}/?${qs.toString()}`;
    const r = await fetch(upstream, { cache: "no-store" });
    const rawTxt = await r.text();
    if (!r.ok) {
      return NextResponse.json(
        { error: `BEA data fetch failed (${r.status})`, details: rawTxt.slice(0, 800) },
        { status: 502 }
      );
    }

    const j = safeJson(rawTxt);
    const data = j?.BEAAPI?.Results?.Data || [];

    const rows = data.map((d: any) => ({
      time: d?.TimePeriod || d?.Time || "",
      value: toNumber(d?.DataValue ?? d?.DataValue_Footnote ?? d?.DataValueNote),
      line: String(d?.LineNumber ?? d?.SeriesCode ?? d?.Line ?? ""),
      lineDesc: String(d?.LineDescription ?? d?.SeriesDescription ?? d?.Description ?? "").trim(),
      unit: d?.CL_UNIT || d?.Unit || null,
    }));

    return NextResponse.json({
      meta: { dataset, param, value, freq, year },
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

function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return {}; }
}
