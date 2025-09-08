// app/api/bea/options/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BEA_BASE = "https://apps.bea.gov/api/data";

function requiredEnv() {
  const key = process.env.BEA_API_KEY;
  if (!key) throw new Error("Missing BEA_API_KEY env var.");
  return key;
}

// Normalize BEA option objects → {value,label}
function normalizeOptions(rows: any[], valueKey: string, labelKey?: string) {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const r of rows || []) {
    const value = String(r[valueKey] ?? "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const labelRaw =
      (labelKey && r[labelKey]) ||
      r["Desc"] ||
      r["Description"] ||
      r["ParameterDescription"] ||
      r[valueKey];
    const label = String(labelRaw ?? value).trim();
    out.push({ value, label });
  }
  return out;
}

function toQS(params: Record<string, string | number | undefined>) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") usp.set(k, String(v));
  });
  return usp.toString();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dataset = url.searchParams.get("dataset") || "";
    const param = url.searchParams.get("param") || "";
    const depsRaw = url.searchParams.get("deps") || "{}";
    const deps = JSON.parse(depsRaw) as Record<string, string>;

    if (!dataset || !param) {
      return NextResponse.json({ error: "dataset and param are required" }, { status: 400 });
    }

    const UserID = requiredEnv();

    // Prefer filtered parameter values if we have dependencies
    const hasDeps = Object.keys(deps).length > 0;
    const method = hasDeps ? "GetParameterValuesFiltered" : "GetParameterValues";

    const queryParams: Record<string, string> = {
      UserID,
      mode: "json",
      method,
      datasetname: dataset,
      ParameterName: param,
    };

    // Add dependencies directly (e.g., Year=2020&Frequency=Q)
    for (const [k, v] of Object.entries(deps)) {
      if (v) queryParams[k] = v;
    }

    const qs = toQS(queryParams);
    const r = await fetch(`${BEA_BASE}/?${qs}`, { cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json({ error: `BEA options fetch failed (${r.status})` }, { status: 502 });
    }
    const j = await r.json();

    // BEA wraps payloads under .BEAAPI.Results.*
    let rows: any[] = [];
    // common envelope variants:
    // - j.BEAAPI.Results.ParamValue
    // - j.BEAAPI.Results.ParamValueList.ParamValue
    // - j.BEAAPI.Results.[Something]
    const results = j?.BEAAPI?.Results;
    if (Array.isArray(results?.ParamValue)) rows = results.ParamValue;
    else if (results?.ParamValueList?.ParamValue) rows = results.ParamValueList.ParamValue;
    else if (Array.isArray(results)) rows = results;
    else {
      // try to find first array within Results
      const firstArr = results && Object.values(results).find((v: any) => Array.isArray(v));
      if (Array.isArray(firstArr)) rows = firstArr;
    }

    // Pick a reasonable value key per param/dataset
    let valueKey = "Key";
    let labelKey: string | undefined = "Desc";

    // Heuristics for common BEA params:
    if (/table/i.test(param)) valueKey = "Key";           // TableName or TableID often under 'Key'
    if (/frequency/i.test(param)) valueKey = "Key";
    if (/year/i.test(param)) valueKey = "Key";
    if (/quarter/i.test(param)) valueKey = "Key";
    if (/geo/i.test(param)) valueKey = "Key";
    if (/line/i.test(param)) valueKey = "Key";
    if (/industry/i.test(param)) valueKey = "Key";
    if (/summary/i.test(param)) valueKey = "Key";
    if (/indicator/i.test(param)) valueKey = "Key";
    if (/area|country/i.test(param)) valueKey = "Key";

    const data = normalizeOptions(rows, valueKey, labelKey);
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

