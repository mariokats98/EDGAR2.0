import { NextResponse } from "next/server";

const BEA_BASE = "https://apps.bea.gov/api/data";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dataset = url.searchParams.get("dataset") || "NIPA"; // NIPA, NIUnderlyingDetail, Regional, etc.
    const key = process.env.BEA_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "Missing BEA_API_KEY env var." }, { status: 500 });
    }

    const qs = new URLSearchParams({
      UserID: key,
      method: "GetParameterValues",
      datasetname: dataset,
      ParameterName: "TableName",
      ResultFormat: "JSON",
    });

    const upstream = `${BEA_BASE}/?${qs.toString()}`;
    const r = await fetch(upstream, { cache: "no-store" });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ error: `BEA tables fetch failed (${r.status})`, details: text.slice(0, 500) }, { status: 502 });
    }

    const j = await r.json();
    const rows: Array<{ TableName: string; TableDescription: string }> =
      j?.BEAAPI?.Results?.ParamValue || [];

    // Normalize + sort by description
    const tables = rows
      .map((t) => ({
        name: t.TableName,
        desc: t.TableDescription || t.TableName,
      }))
      .sort((a, b) => a.desc.localeCompare(b.desc));

    return NextResponse.json({ dataset, tables });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

