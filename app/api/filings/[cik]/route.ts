// app/api/filings/[cik]/route.ts
import { NextResponse } from "next/server";

const UA = process.env.SEC_USER_AGENT || "HerevnaBot/1.0 (admin@herevna.io)";
const padCIK = (s: string) => s.padStart(10, "0");

export async function GET(
  _req: Request,
  { params }: { params: { cik: string } }
) {
  try {
    const cik10 = padCIK(params.cik || "");
    if (!/^\d{10}$/.test(cik10)) {
      return NextResponse.json({ error: "Invalid CIK" }, { status: 400 });
    }

    const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: `SEC fetch failed (${r.status})` }, { status: 502 });
    const data = await r.json();

    const recent = data?.filings?.recent ?? {};
    const n = Math.min(20, (recent?.accessionNumber || []).length);
    const out: any[] = [];
    for (let i = 0; i < n; i++) {
      const form = String(recent.form[i] || "");
      const filed_at = recent.filingDate[i];
      const acc = (recent.accessionNumber[i] || "").replace(/-/g, "");
      const primary = recent.primaryDocument[i] || null;
      const accIdx = recent.accessionNumber[i] || "";
      const cikNum = parseInt(cik10, 10);

      const base = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}`;
      const primaryUrl = primary ? `${base}/${primary}` : base;
      const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${accIdx}-index.htm`;

      out.push({
        cik: cik10,
        company: data?.name || "Company",
        form,
        filed_at,
        title: `${data?.name || "Company"} • ${form} • ${filed_at}`,
        index_url: indexUrl,
        primary_doc_url: primaryUrl,
      });
    }

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
