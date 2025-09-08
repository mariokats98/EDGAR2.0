// app/api/bea/query/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BEA_BASE = "https://apps.bea.gov/api/data";

function requiredEnv() {
  const key = process.env.BEA_API_KEY;
  if (!key) throw new Error("Missing BEA_API_KEY env var.");
  return key;
}

function toQS(params: Record<string, string | number | undefined>) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") usp.set(k, String(v));
  });
  return usp.toString();
}

// Generic row → {date,value}
function coerceNumber(x: string | number | null | undefined): number | null {
  if (x == null) return null;
  const s = String(x).replace(/[, ]/g, "");
  if (!s || s === "NA" || s === "(NA)" || s === ".") return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

function rowToPoint(r: any): { date: string; value: number } | null {
  // Common BEA time keys: TimePeriod, Time, Year, Quarter, Month
  const tp = r.TimePeriod || r.Time || r.Year || r.TimePeriodName;
  if (!tp) return null;

  // Try to build ISO-ish date:
  // If tp looks like "2024", "2024-Q3", "2024M07", "2024-07"
  let iso = String(tp);
  if (/^\d{4}Q[1-4]$/i.test(iso)) {
    const y = iso.slice(0, 4);
    const q = Number(iso.slice(5));
    const month = (q - 1) * 3 + 1;
    iso = `${y}-${String(month).padStart(2, "0")}-01`;
  } else if (/^\d{6}$/.test(iso)) {
    // e.g., 202407 (YYYYMM)
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
    const dataset = String(body?.dataset || "");
    const params = (body?.params || {}) as Record<string, string>;

    if (!dataset) return NextResponse.json({ error: "dataset is required" }, { status: 400 });

    const UserID = requiredEnv();

    // Build a GetData request
    const queryParams: Record<string, string> = {
      UserID,
      mode: "json",
      method: "GetData",
      datasetname: dataset,
    };

    // Pass through selected params (TableName, Frequency, Year, etc.)
    for (const [k, v] of Object.entries(params)) {
      if (v) queryParams[k] = v;
    }

    const r = await fetch(`${BEA_BASE}/?${toQS(queryParams)}`, { cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json({ error: `BEA data fetch failed (${r.status})` }, { status: 502 });
    }
    const j = await r.json();

    // Extract rows array; BEA wraps under .BEAAPI.Results.[SomeArray]
    const results = j?.BEAAPI?.Results;
    let rows: any[] = [];
    if (Array.isArray(results?.Data)) rows = results.Data;
    else {
      const firstArr = results && Object.values(results).find((v: any) => Array.isArray(v));
      if (Array.isArray(firstArr)) rows = firstArr;
    }

    const points = rows
      .map(rowToPoint)
      .filter(Boolean) as { date: string; value: number }[];

    // Try to build a friendly title/units
    const metaRow = rows[0] || {};
    const title =
      metaRow.SeriesName ||
      metaRow.LineDescription ||
      metaRow.TableName ||
      `${dataset} Series`;
    const units =
      metaRow.UnitOfMeasure ||
      metaRow.Unit ||
      metaRow.UnitName ||
      "";

    return NextResponse.json({
      title,
      units,
      data: points,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

