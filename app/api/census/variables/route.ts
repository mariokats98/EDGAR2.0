import { NextResponse } from "next/server";

/**
 * GET /api/census/variables?dataset=acs/acs5&vintage=2022
 * Notes:
 *  - ACS/PEP/etc → use /data/<vintage>/<dataset>/variables.json
 *  - timeseries/... → use /data/<dataset>/variables.json  (no vintage in path)
 */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const dataset = (u.searchParams.get("dataset") || "acs/acs5").trim();
    const vintage = (u.searchParams.get("vintage") || "2022").trim();

    // Build the proper URL (timeseries has no vintage in path)
    const isTimeseries = dataset.toLowerCase().startsWith("timeseries/");
    const url = isTimeseries
      ? `https://api.census.gov/data/${encodeURIComponent(dataset)}/variables.json`
      : `https://api.census.gov/data/${encodeURIComponent(vintage)}/${encodeURIComponent(
          dataset
        )}/variables.json`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      // helpful context back to the UI
      const body = await r.text();
      return NextResponse.json(
        { error: `Census variables fetch failed (${r.status})`, url, body: body?.slice(0, 500) },
        { status: 502 }
      );
    }
    const j = await r.json();

    const vars = Object.entries(j?.variables || {}).map(([name, meta]: any) => ({
      name,
      label: meta?.label || name,
      concept: meta?.concept || "",
      predicateType: meta?.predicateType || "",
      group: meta?.group || null,
    }));

    // Sort a bit nicer: estimates (…_E) first, then alphabetical
    vars.sort((a, b) => {
      const ae = a.name.endsWith("_E") ? 0 : 1;
      const be = b.name.endsWith("_E") ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ dataset, vintage, variables: vars, url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}