import { NextResponse } from "next/server";

const UA = process.env.SEC_USER_AGENT || "Herevna/1.0 (contact@herevna.io)";

type FilingRow = {
  form: string;
  filed: string;
  accession: string;
  title: string;
  index_url: string;
  archive_url: string;
  primary_doc: string | null;
  download_url: string;
};

function pad10(s: string) {
  return s.replace(/\D/g, "").padStart(10, "0");
}

function mapRowsFromBundle(cik10: string, bundle: any): FilingRow[] {
  const recent = bundle?.filings?.recent;
  if (!recent) return [];
  const n = (recent.accessionNumber?.length ?? 0) as number;
  const out: FilingRow[] = [];
  for (let i = 0; i < n; i++) {
    const form = String(recent.form[i] ?? "");
    const filed = String(recent.filingDate[i] ?? "");
    const acc = String(recent.accessionNumber[i] ?? "").replace(/-/g, "");
    const primary = String(recent.primaryDocument?.[i] ?? "");
    const cikNum = parseInt(cik10, 10);
    const base = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}`;
    out.push({
      form,
      filed,
      accession: acc,
      title: `${form} • ${filed}`,
      index_url: `${base}/${primary || "index.html"}`,
      archive_url: base,
      primary_doc: primary || null,
      download_url: `${base}/${primary || "index.html"}`,
    });
  }
  return out;
}

async function fetchJSON(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  return r.json();
}

function withinDate(row: FilingRow, start?: string, end?: string) {
  if (start && row.filed < start) return false;
  if (end && row.filed > end) return false;
  return true;
}

export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    const cik10 = pad10(params.cik);
    const { searchParams } = new URL(req.url);

    const formsParam = (searchParams.get("forms") || "").trim(); // CSV
    const start = searchParams.get("start") || "";                // YYYY-MM-DD
    const end = searchParams.get("end") || "";                    // YYYY-MM-DD
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    const wantedForms = new Set(
      formsParam
        ? formsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
        : []
    );

    // 1) Load main submissions bundle
    const bundleUrl = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    const bundle = await fetchJSON(bundleUrl);

    // 2) Start with "recent"
    let collected: FilingRow[] = mapRowsFromBundle(cik10, bundle);

    // 3) Add all yearly archives (full history)
    const files: { name: string; filingFrom?: string; filingTo?: string }[] =
      bundle?.filings?.files ?? [];

    if (Array.isArray(files) && files.length) {
      // Fetch newest → oldest so recent results show quickly
      files.sort((a, b) => (a.name < b.name ? 1 : -1));
      for (const f of files) {
        const url = `https://data.sec.gov/submissions/${f.name}`;
        try {
          const yearBundle = await fetchJSON(url);
          collected.push(...mapRowsFromBundle(cik10, yearBundle));
          if (collected.length > 15000) break; // soft cap for serverless memory
        } catch {
          // ignore individual year failures
        }
      }
    }

    // 4) Apply filters
    let filtered = collected;

    if (wantedForms.size) {
      filtered = filtered.filter((r) => wantedForms.has(r.form.toUpperCase()));
    }

    if (start || end) {
      filtered = filtered.filter((r) => withinDate(r, start || undefined, end || undefined));
    }

    // 5) Sort desc by date then accession
    filtered.sort((a, b) =>
      a.filed < b.filed ? 1 : a.filed > b.filed ? -1 : a.accession < b.accession ? 1 : -1
    );

    // 6) Paginate
    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    return NextResponse.json({ data: page, total });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}