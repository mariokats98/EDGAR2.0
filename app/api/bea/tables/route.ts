// app/api/bea/tables/route.ts
import { NextResponse } from "next/server";

type Option = { value: string; label: string };

const BEA_API_BASE = "https://apps.bea.gov/api/data/";

// prefer server-only secret; fall back to a public one if you had it
const BEA_KEY =
  process.env.BEA_API_KEY ??
  process.env.NEXT_PUBLIC_BEA_API_KEY ??
  "";

// Helper: build safe query string (no undefineds, everything as string)
function makeQS(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.append(k, String(v));
  }
  return qs;
}

// GET /api/bea/tables?dataset=NIPA (dataset optional; defaults to NIPA)
// Returns available parameter values for a few common BEA params you likely use
export async function GET(req: Request) {
  try {
    if (!BEA_KEY) {
      return NextResponse.json(
        { error: "BEA_API_KEY is not configured on the server" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const dataset = searchParams.get("dataset") || "NIPA";

    // Example: fetch valid values for a couple of parameters your UI might need.
    // Adjust the list as your UI expects (e.g., "TableName", "TableID", "Frequency", etc.)
    const [tables, frequencies] = await Promise.all([
      fetchValues(dataset, "TableName"),
      fetchValues(dataset, "Frequency"),
    ]);

    return NextResponse.json({
      dataset,
      tables,
      frequencies,
    });
  } catch (err) {
    console.error("BEA tables route error:", err);
    return NextResponse.json(
      { error: "Failed to fetch BEA data" },
      { status: 500 }
    );
  }
}

// Call BEA GetParameterValues for a specific parameter
async function fetchValues(
  dataset: string,
  parameterName: string
): Promise<Option[]> {
  const qs = makeQS({
    UserID: BEA_KEY, // MUST be string (we ensure non-undefined above)
    method: "GetParameterValues",
    datasetname: dataset,
    ParameterName: parameterName,
    ResultFormat: "JSON",
  });

  const url = `${BEA_API_BASE}?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    // Return empty list on failure rather than throwing, if you prefer
    throw new Error(`BEA request failed for ${parameterName}: ${res.status}`);
  }

  const data = (await res.json()) as any;

  // The BEA response shape depends on ParameterName. Common shape:
  // { BEAAPI: { Results: { ParamValue: [{ Key: "...", Desc: "..." }, ...] } } }
  const paramValues =
    data?.BEAAPI?.Results?.ParamValue ??
    data?.BEAAPI?.Results?.ParamValueList ??
    [];

  // Normalize to { value, label }
  const options: Option[] = paramValues.map((row: any) => ({
    value: String(row.Key ?? row.Value ?? row.ParameterValue ?? ""),
    label: String(row.Desc ?? row.Description ?? row.Key ?? ""),
  }));

  // filter out empties just in case
  return options.filter((o) => o.value);
}

export const dynamic = "force-dynamic";