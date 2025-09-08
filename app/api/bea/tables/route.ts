// app/api/bea/tables/route.ts
import { NextResponse } from "next/server";

const BEA_BASE = "https://apps.bea.gov/api/data";

// Normalize dataset names (handles case, punctuation)
const DATASET_ALIASES: Record<string, string> = {
  nipa: "NIPA",
  niunderlyingdetail: "NIUnderlyingDetail",
  fixedassets: "FixedAssets",
  gdpbyindustry: "GDPByIndustry",
  underlyinggdpbyindustry: "UnderlyingGDPbyIndustry",
  inputoutput: "InputOutput",
  regional: "Regional",
  ita: "ITA",
  intlservtrade: "IntlServTrade",
  intlservsta: "IntlServSTA",
  iip: "IIP",
  mne: "MNE",
};
function normDataset(s: string) {
  const k = (s || "").replace(/[^a-z]/gi, "").toLowerCase();
  return DATASET_ALIASES[k] || s || "NIPA";
}

// Known/likely parameter names to list choices for each dataset
const CANDIDATE_PARAMS: Record<string, string[]> = {
  NIPA: ["TableName", "TableID"],
  NIUnderlyingDetail: ["TableName", "TableID"],
  FixedAssets: ["TableName", "TableID"],
  GDPByIndustry: ["TableID", "TableName"],
  Regional: ["TableName", "TableID"],
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
    const raw = url.searchParams.get("dataset") || "NIPA";
    const dataset = normDataset(raw);

    const key = process.env.BEA_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "Missing BEA_API_KEY env var." }, { status: 500 });
    }

    const candidates = CANDIDATE_PARAMS[dataset] ?? ["TableName", "TableID", "Indicator", "Series"];

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

      // Handle BEA error format gracefully
      if (j?.BEAAPI?.Error) return [];

      const rows = j?.BEAAPI?.Results?.ParamValue ?? [];
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
      const seen = new Set<string>();
      return out.filter((o) => o.key && !seen.has(o.key) && seen.add(o.key));
    }

    for (const param of candidates) {
      try {
        const options = await fetchValues(param);
        if (options.length > 0) {
          options.sort((a, b) => a.desc.localeCompare(b.desc));
          return NextResponse.json({ dataset, paramUsed: param, options });
        }
      } catch {
        // try next candidate
      }
    }

    return NextResponse.json({
      dataset,
      paramUsed: null,
      options: [],
      warning: "No listable selector found for this dataset.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
