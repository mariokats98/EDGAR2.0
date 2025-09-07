import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SEC_HEADERS = {
  "User-Agent": process.env.SEC_USER_AGENT || "Herevna/1.0 (email@example.com)",
  "Accept": "application/json"
};

function zeroPadCIK(cik: string) { return cik.replace(/\D/g, "").padStart(10, "0"); }

export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    const url = new URL(req.url, "http://local");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const per = Math.min(50, Math.max(1, parseInt(url.searchParams.get("per") || "10")));
    const startDate = url.searchParams.get("start") || "";
    const endDate = url.searchParams.get("end") || "";
    const forms = (url.searchParams.get("forms") || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

    const cik10 = zeroPadCIK(params.cik);
    const subUrl = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    const r = await fetch(subUrl, { headers: SEC_HEADERS, cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: "SEC fetch failed" }, { status: 502 });
    const data = await r.json();

    const recent = data?.filings?.recent || {};
    const list = (recent.accessionNumber || []).map((_, i: number) => ({
      acc: String(recent.accessionNumber[i]).replace(/-/g, ""),
      date: String(recent.filingDate[i] || ""),
      form: String(recent.form[i] || ""),
      primary: String(recent.primaryDocument[i] || ""),
      company: data?.name || "Company",
      cik: cik10
    }));

    // Filter by date and form
    const filtered = list.filter(it => {
      if (forms.length && !forms.includes(it.form.toUpperCase())) return false;
      if (startDate && it.date < startDate) return false;
      if (endDate && it.date > endDate) return false;
      return true;
    });

    // Sort desc by date
    filtered.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    // Pagination
    const total = filtered.length;
    const startIndex = (page - 1) * per;
    const pageItems = filtered.slice(startIndex, startIndex + per).map(f => {
      const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(f.cik,10)}/${f.acc}`;
      const primaryUrl = f.primary ? `${base}/${f.primary}` : null;
      return {
        cik: f.cik,
        company: f.company,
        form: f.form,
        filed_at: f.date,
        title: `${f.company} • ${f.form} • ${f.date}`,
        source_url: base,
        primary_doc_url: primaryUrl
      };
    });

    return NextResponse.json({ total, page, per, results: pageItems });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
