// app/api/bea/meta/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type DatasetKey = "NIPA" | "Regional" | "GDPByIndustry" | "InputOutput" | "ITA";

const DATASET_LABEL: Record<DatasetKey, string> = {
  NIPA: "NIPA (National Income & Product Accounts)",
  Regional: "Regional (State/County/MSA)",
  GDPByIndustry: "GDP by Industry",
  InputOutput: "Input-Output (Use/Make)",
  ITA: "International Transactions (ITA)",
};

// These must match your BEA UI page.tsx schema order
const SCHEMA: Record<DatasetKey, string[]> = {
  NIPA: ["TableName", "Frequency", "Year", "Quarter"],
  Regional: ["TableName", "Geo", "LineCode", "Year"],
  GDPByIndustry: ["TableID", "Industry", "Frequency", "Year"],
  InputOutput: ["TableID", "Year", "Summary"],
  ITA: ["Indicator", "AreaOrCountry", "Frequency", "Year"],
};

// Friendly labels (optional)
const LABELS: Record<string, string> = {
  TableName: "Table",
  Frequency: "Frequency",
  Year: "Year",
  Quarter: "Quarter",
  Geo: "Geography",
  LineCode: "Line Code / Series",
  TableID: "Table",
  Industry: "Industry",
  Summary: "Summary Type",
  Indicator: "Indicator",
  AreaOrCountry: "Area / Country",
};

export async function GET() {
  return NextResponse.json({
    datasets: DATASET_LABEL,
    schema: SCHEMA,
    labels: LABELS,
  });
}

