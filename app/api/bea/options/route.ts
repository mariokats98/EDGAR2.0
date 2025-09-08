// app/api/bea/options/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BEA_BASE = "https://apps.bea.gov/api/data";

type DatasetKey = "NIPA" | "Regional" | "GDPByIndustry" | "InputOutput" | "ITA";

/**
 * UI -> BEA parameter name mapping per dataset
 * (Add more as you expose more datasets/params)
 */
const PARAM_MAP: Record<DatasetKey, Record<string, string>> = {
  NIPA: {
    TableName: "TableName",
    Frequency: "Frequency",
    Year: "Year",
    Quarter: "Quarter",
  },
  Regional: {
    // Regional dataset commonly uses GeoFIPS + LineCode + TableName + Year
    TableName: "TableName",
    Geo: "GeoFIPS",
    LineCode: "LineCode",
    Year: "Year",
    // (No Frequency/Quarter for most Regional tables)
  },
  GDPByIndustry: {
    TableID: "TableID",
    Industry: "Industry",
    Frequency: "Frequency",
    Year: "Year",
  },
  InputOutput: {
    TableID: "TableID",
    Year: "Year",
    Summary: "Summary",
  },
  ITA: {
    Indicator: "Indicator",
    AreaOrCountry: "AreaOrCountry",
    Frequency: "Frequency",
    Year: "Year",
  },
};

function beaParam(dataset: string, uiParam: string): string {
  const ds = (dataset || "") as DatasetKey;
  const map = PARAM_MAP[ds as DatasetKey];
  return (map && map[uiParam]) || uiParam;
}

function requireKey() {
  const key = process.env.BEA_API_KEY;
  if (!key) throw new Error("Missing BEA_API_KEY env var.");
  return key;
}

function qs(params: Record<string, string | number | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  }
  return u.toString();
}

function normalizeOptions(rows: any[], valueKey = "Key", labelKey?: string) {
  const out: { value: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows || []) {
    const value = String(r[valueKey] ?? "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const label =
      String(
        (labelKey && r[labelKey]) ||
          r.Desc ||
          r.Description ||
          r.ParameterDescription ||
          value
      ).trim();
    out.push({ value, label });
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dataset = (url.searchParams.get("dataset") || "") as DatasetKey;
    const uiParam = url.searchParams.get("param") || "";
    const depsRaw = url.searchParams.get("deps") || "{}";
    const deps = JSON.parse(depsRaw) as Record<string, string>;

    if (!dataset || !uiParam) {
      return NextResponse.json(
        { error: "dataset and param are required" },
        { status: 400 }
      );
    }

    const UserID = requireKey();

    // Translate UI param to BEA param
    const targetParam = beaParam(dataset, uiParam);

    // Build query. If we have dependencies selected, use GetParameterValuesFiltered
    const hasDeps = Object.keys(deps).length > 0;
    const method = hasDeps ? "GetParameterValuesFiltered" : "GetParameterValues";

    const base: Record<string, string> = {
      UserID,
      mode: "json",
      method,
      datasetname: dataset,
    };

    if (hasDeps) {
      // TargetParameter is the param we want options for
      base["TargetParameter"] = targetParam;
      // Add each dependency mapped to BEA param name
      for (const [k, v] of Object.entries(deps)) {
        if (!v) continue;
        base[beaParam(dataset, k)] = v;
      }
    } else {
      // Unfiltered path uses ParameterName
      base["ParameterName"] = targetParam;
    }

    const r = await fetch(`${BEA_BASE}/?${qs(base)}`, { cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json(
        { error: `BEA options fetch failed (${r.status})` },
        { status: 502 }
      );
    }
    const j = await r.json();

    const results = j?.BEAAPI?.Results;
    let rows: any[] = [];
    if (Array.isArray(results?.ParamValue)) rows = results.ParamValue;
    else if (results?.ParamValueList?.ParamValue)
      rows = results.ParamValueList.ParamValue;
    else {
      const firstArr =
        results && Object.values(results).find((v: any) => Array.isArray(v));
      if (Array.isArray(firstArr)) rows = firstArr;
    }

    // Heuristic defaults are fine for BEA option payloads:
    const data = normalizeOptions(rows, "Key", "Desc");
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
