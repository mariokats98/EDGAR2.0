// app/api/bea/options/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BEA_BASE = "https://apps.bea.gov/api/data";

type DatasetKey = "NIPA" | "Regional" | "GDPByIndustry" | "InputOutput" | "ITA";

const PARAM_MAP: Record<DatasetKey, Record<string, string>> = {
  NIPA: { TableName: "TableName", Frequency: "Frequency", Year: "Year", Quarter: "Quarter", LineNumber: "LineNumber" },
  Regional: { TableName: "TableName", Geo: "GeoFIPS", LineCode: "LineCode", Year: "Year" },
  GDPByIndustry: { TableID: "TableID", Industry: "Industry", Frequency: "Frequency", Year: "Year" },
  InputOutput: { TableID: "TableID", Year: "Year", Summary: "Summary" },
  ITA: { Indicator: "Indicator", AreaOrCountry: "AreaOrCountry", Frequency: "Frequency", Year: "Year" },
};

function beaParam(dataset: string, uiParam: string): string {
  const map = PARAM_MAP[dataset as DatasetKey];
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

async function fetchOptions(base: Record<string, string>) {
  const r = await fetch(`${BEA_BASE}/?${qs(base)}`, { cache: "no-store" });
  if (!r.ok) return { rows: [], status: r.status };
  const j = await r.json();
  const results = j?.BEAAPI?.Results;
  let rows: any[] = [];
  if (Array.isArray(results?.ParamValue)) rows = results.ParamValue;
  else if (results?.ParamValueList?.ParamValue) rows = results.ParamValueList.ParamValue;
  else {
    const firstArr = results && Object.values(results).find((v: any) => Array.isArray(v));
    if (Array.isArray(firstArr)) rows = firstArr;
  }
  return { rows, status: 200 };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dataset = (url.searchParams.get("dataset") || "") as DatasetKey;
    const uiParam = url.searchParams.get("param") || "";
    const depsRaw = url.searchParams.get("deps") || "{}";
    const deps = JSON.parse(depsRaw) as Record<string, string>;

    if (!dataset || !uiParam) {
      return NextResponse.json({ error: "dataset and param are required" }, { status: 400 });
    }

    const UserID = requireKey();
    const targetParam = beaParam(dataset, uiParam);
    const hasDeps = Object.keys(deps).length > 0;

    // 1) Try filtered (when deps exist)
    let base: Record<string, string> = {
      UserID, mode: "json", datasetname: dataset,
      method: hasDeps ? "GetParameterValuesFiltered" : "GetParameterValues",
    };

    if (hasDeps) {
      base["TargetParameter"] = targetParam;
      for (const [k, v] of Object.entries(deps)) {
        if (v) base[beaParam(dataset, k)] = v;
      }
    } else {
      base["ParameterName"] = targetParam;
    }

    let { rows } = await fetchOptions(base);

    // 2) Fallback: if no rows came back, try unfiltered
    if (!rows.length && hasDeps) {
      const alt = {
        UserID, mode: "json", datasetname: dataset,
        method: "GetParameterValues", ParameterName: targetParam,
      };
      ({ rows } = await fetchOptions(alt));
    }

    // 3) Final safety: synthesize options for Frequency/Year if still empty
    if (!rows.length && uiParam === "Frequency") {
      rows = [
        { Key: "A", Desc: "Annual" },
        { Key: "Q", Desc: "Quarterly" },
        { Key: "M", Desc: "Monthly" },
      ];
    }
    if (!rows.length && uiParam === "Year") {
      const thisYear = new Date().getFullYear();
      // Provide "ALL" plus a rolling range
      rows = [{ Key: "ALL", Desc: "ALL Years" }];
      for (let y = thisYear; y >= 1990; y--) rows.push({ Key: String(y), Desc: String(y) });
    }

    const data = normalizeOptions(rows, "Key", "Desc");
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
