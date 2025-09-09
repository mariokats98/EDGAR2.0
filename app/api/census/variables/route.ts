import { NextResponse } from "next/server";

/**
 * GET /api/census/variables?dataset=acs/acs5&vintage=2022
 * Returns the variables metadata for the chosen dataset+vintage.
 * Example dataset values:
 *  - acs/acs5            (American Community Survey 5-year)
 *  - acs/acs1            (ACS 1-year)
 *  - pep/population      (Population Estimates Program)
 *  - timeseries/poverty/saipe
 */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const dataset = u.searchParams.get("dataset") || "acs/acs5";
    const vintage = u.searchParams.get("vintage") || "2022";

    // Variables endpoint:
    // https://api.census.gov/data/<vintage>/<dataset>/variables.json
    const url = `https://api.census.gov/data/${encodeURIComponent(
      vintage
    )}/${encodeURIComponent(dataset)}/variables.json`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json(
        { error: `Census variables fetch failed (${r.status})` },
        { status: 502 }
      );
    }
    const j = await r.json();
    // j = { variables: { B01001_001E: {label:"...", ...}, ... } }

    // Convert to array for UI friendliness
    const vars = Object.entries(j?.variables || {}).map(([name, meta]: any) => ({
      name,
      label: meta?.label || name,
      concept: meta?.concept || "",
      predicateType: meta?.predicateType || "",
      group: meta?.group || null,
    }));

    return NextResponse.json({ dataset, vintage, variables: vars });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}