// app/api/bea/gdp/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Call your generic query endpoint so everything is consistent
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/bea/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      dataset: "NIPA",
      params: {
        TableName: "T10106",   // Real GDP (chained dollars)
        LineNumber: "1",       // Headline line
        Frequency: "Q",
        Year: "ALL",
      },
    }),
  });
  const j = await res.json();
  return NextResponse.json(j, { status: res.ok ? 200 : 500 });
}

