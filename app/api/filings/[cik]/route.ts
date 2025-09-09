// app/api/filings/[cik]/route.ts
import { NextResponse } from "next/server";

const UA = process.env.SEC_USER_AGENT || "Herevna/1.0 (contact@herevna.io)";

export async function GET(
  req: Request,
  { params }: { params: { cik: string } }
) {
  try {
    const cik = params.cik.padStart(10, "0");
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) {
      return NextResponse.json({ error: "Could not fetch filings" }, { status: 404 });
    }
    const j = await r.json();

    // Map filings into a cleaner format
    const filings = (j.filings?.recent || {});
    const count = filings.accessionNumber?.length || 0;

    const data = Array.from({ length: count }, (_, i) => ({
      accessionNumber: filings.accessionNumber[i],
      filingDate: filings.filingDate[i],
      form: filings.form[i],
      reportDate: filings.reportDate[i],
      primaryDoc: filings.primaryDocument[i],
      link: `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, "")}/${filings.accessionNumber[i].replace(/-/g, "")}/${filings.primaryDocument[i]}`
    }));

    return NextResponse.json({ cik, filings: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}