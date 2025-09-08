// app/api/bea/query/route.ts
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

function coerceNumber(x: any): number | null {
  if (x == null) return null;
  const s = String(x).replace(/[, ]/g, "");
  if (!s || s === "NA" || s === "(NA)" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function rowToPoint(r: any): { date: string; value: number } | null {
  const tp = r.TimePeriod || r.Time || r.Year || r.TimePeriodName;
  if (!tp) return null;

  let iso = String(tp);

  if (/^\d{4}Q[1-4]$/i.test(iso)) {
    const y = iso.slice(0, 4);
    const q = Number(iso.slice(4).replace(/q/i, ""));
    const month = (q - 1) * 3 + 1;
    iso = `${y}-${String(month).padStart(2, "0")}-01`;
  } else if (/^\d{6}$/.test(iso)) {
    // e.g. 202407 (YYYYMM)
    iso = `${iso.slice(0, 4)}-${iso.slice(4, 6)}-01`;
  } else if (/^\d{4}$/.test(iso)) {
    iso = `${iso}-01-01`;
  }

  const v =
    coerceNumber(r.DataValue) ??
    coerceNumber(r.Data) ??
    coerceNumber(r.Value) ??
    coerceNumber(r.OBS_VALUE);

  if (v == null) return null;
  return { date: iso, value: v };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const dataset = String(body?.dataset || "") as DatasetKey;
    const params = (body?.params || {}) as Record<string, string>;

    if (!dataset) {
      return NextResponse.json({ error: "dataset is required" }, { status: 400 });
    }

    const UserID = requireKey();

    // Translate UI params → BEA params
    const beaParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (!v) continue;
      beaParams[beaParam(dataset, k)] = v;
    }

    const query: Record<string, string> = {
      UserID,
      mode: "json",
      method: "GetData",
      datasetname: dataset,
      ...beaParams,
    };

    const r = await fetch(`${BEA_BASE}/?${qs(query)}`, { cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json(
        { error: `BEA data fetch failed (${r.status})` },
        { status: 502 }
      );
    }
    const j = await r.json();

    const results = j?.BEAAPI?.Results;
    let rows: any[] = [];
    if (Array.isArray(results?.Data)) rows = results.Data;
    else {
      const firstArr = results && Object.values(results).find((v: any) => Array.isArray(v));
      if (Array.isArray(firstArr)) rows = firstArr;
    }

    const points = rows.map(rowToPoint).filter(Boolean) as { date: string; value: number }[];

    const meta = rows[0] || {};
    const title =
      meta.SeriesName ||
      meta.LineDescription ||
      meta.TableName ||
      `${dataset} Series`;
    const units =
      meta.UnitOfMeasure || meta.Unit || meta.UnitName || "";

    return NextResponse.json({ title, units, data: points });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
