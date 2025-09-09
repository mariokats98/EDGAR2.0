// app/api/filings/[cik]/route.ts
import { NextResponse } from "next/server";

const UA = process.env.SEC_USER_AGENT || "Herevna/1.0 (contact@herevna.io)";

function pad10(s: string) {
  return s.replace(/\D/g, "").padStart(10, "0");
}

export async function GET(
  req: Request,
  { params }: { params: { cik: string } }
) {
  try {
    const cik10 = pad10(params.cik);
    const { searchParams } = new URL(req.url);
    const formsParam = (searchParams.get("forms") || "").trim(); // CSV of forms (optional)
    const startDate = searchParams.get("start") || ""; // YYYY-MM-DD optional
    const endDate = searchParams.get("end") || "";     // YYYY-MM-DD optional
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    const r = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: `SEC fetch failed (${r.status})` }, { status: 502 });
    const data = await r.json();

    const recent = data?.filings?.recent;
    if (!recent) return NextResponse.json({ data: [], total: 0 });

    const rows: any[] = [];
    const n = recent.accessionNumber?.length || 0;
    for (let i = 0; i < n; i++) {
      const form = String(recent.form[i] || "");
      const filed = String(recent.filingDate[i] || "");
      const acc = String(recent.accessionNumber[i] || "").replace(/-/g, "");
      const primary = String(recent.primaryDocument[i] || "");
      const cikNum = parseInt(cik10, 10);
      const base = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}`;
      rows.push({
        form,
        filed,
        accession: acc,
        title: `${form} • ${filed}`,
        index_url: `${base}/${primary || "index.html"}`,
        archive_url: base,
        primary_doc: primary || null,
        download_url: `${base}/${primary || "index.html"}`, // for “download” buttons
      });
    }

    // Filters
    let filtered = rows;
    if (formsParam) {
      const wanted = new Set(
        formsParam
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      );
      filtered = filtered.filter((r) => wanted.has(r.form.toUpperCase()));
    }
    if (startDate) filtered = filtered.filter((r) => r.filed >= startDate);
    if (endDate) filtered = filtered.filter((r) => r.filed <= endDate);

    // Sort desc by date
    filtered.sort((a, b) => (a.filed < b.filed ? 1 : a.filed > b.filed ? -1 : 0));

    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    return NextResponse.json({ data: page, total });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}