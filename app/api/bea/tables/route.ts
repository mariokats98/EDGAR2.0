// app/api/bea/tables/route.ts
import { NextResponse } from "next/server";

const BEA_BASE = "https://apps.bea.gov/api/data";

// Best-guess parameter names to list “what can I pick?” for each dataset.
// We try these in order until we find a non-empty list.
const CANDIDATE_PARAMS: Record<string, string[]> = {
  // Known:
  NIPA: ["TableName", "TableID"],
  NIUnderlyingDetail: ["TableName", "TableID"],
  FixedAssets: ["TableName", "TableID"],
  GDPByIndustry: ["TableID", "TableName"],
  Regional: ["TableName", "TableID"],

  // Often not “table-like”; give a reasonable fallback:
  UnderlyingGDPbyIndustry: ["TableID", "TableName", "Industry"],
  InputOutput: ["TableID", "TableName"],
  ITA: ["Indicator", "Series", "TypeOfInvestment"],
  IntlServTrade: ["TypeOfService", "TradeDirection", "AreaOrCountry"],
  IntlServSTA: ["Channel", "Destination", "Industry"],
  IIP: ["TypeOfInvestment", "Component"],
  MNE: ["DirectionOfInvestment", "Series", "Classification"],
};

type Option = { key: string; desc: string };

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dataset = url.searchParams.get("dataset") || "NIPA";
    const key = process.env.BEA_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "Missing BEA_API_KEY env var." }, { status: 500 });
    }

    // Fall back to a generic list if dataset not in map
    const candidates = CANDIDATE_PARAMS[dataset] ?? ["TableName", "TableID", "Indicator", "Series"];

    // Utility: fetch ParameterValues for a specific parameter
    async function fetchValues(paramName: string): Promise<Option[]> {
      const qs = new URLSearchParams({
        UserID: key,
        method: "GetParameterValues",
        datasetname: dataset,
        ParameterName: paramName,
        ResultFormat: "JSON",
      });
      const r = await fetch(`${BEA_BASE}/?${qs.toString()}`, { cache: "no-store" });
      if (!r.ok) return [];
      const j = await r.json();
      const rows = j?.BEAAPI?.Results?.ParamValue ?? [];
      // Try to figure out sensible label/desc
      const out: Option[] = rows.map((x: any) => {
        const k = String(x?.Key ?? x?.SeriesID ?? x?.Value ?? "").trim();
        const d =
          String(
            x?.Desc ||
              x?.Description ||
              x?.TableDescription ||
              x?.SeriesDescription ||
              x?.Note ||
              k
          ).trim();
        return { key: k, desc: d || k };
      });
      // filter out empties/duplicates
      const seen = new Set<string>();
      return out.filter((o) => o.key && !seen.has(o.key) && seen.add(o.key));
    }

    // Try each candidate until we get a non-empty list
    for (const param of candidates) {
      try {
        const options = await fetchValues(param);
        if (options.length > 0) {
          // Sort by description for friendliness
          options.sort((a, b) => a.desc.localeCompare(b.desc));
          return NextResponse.json({ dataset, paramUsed: param, options });
        }
      } catch {
        // try next
      }
    }

    // As a last resort: tell the UI there is nothing to pick
    return NextResponse.json({
      dataset,
      paramUsed: null,
      options: [],
      warning: "No listable parameter found for this dataset.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

