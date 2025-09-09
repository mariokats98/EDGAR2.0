// app/api/filings/[cik]/route.ts
import { NextResponse } from "next/server";

const UA = process.env.SEC_USER_AGENT || "Herevna/1.0 (contact@example.com)";
const SEC_JSON = (cik10: string) => `https://data.sec.gov/submissions/CIK${cik10}.json`;
const SEC_ARCH_BASE = (cik: number, accNoNoDashes: string) =>
  `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoNoDashes}`;

function padCIK(cikRaw: string) {
  const n = (cikRaw || "").replace(/\D/g, "");
  if (!n) throw new Error("Invalid CIK");
  return n.padStart(10, "0");
}

function toDate(s?: string) {
  // accept YYYY, YYYY-MM, YYYY-MM-DD
  if (!s) return null;
  if (/^\d{4}$/.test(s)) return new Date(`${s}-01-01T00:00:00Z`);
  if (/^\d{4}-\d{2}$/.test(s)) return new Date(`${s}-01T00:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00Z`);
  const d = new Date(s);
  return isNaN(+d) ? null : d;
}

function inRange(dISO: string, start?: Date | null, end?: Date | null) {
  const d = new Date(dISO + "T00:00:00Z");
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

type FilingRow = {
  form: string;
  filingDate: string;
  reportDate?: string;
  acceptanceDateTime?: string;
  accessionNumber: string; // with dashes
  primaryDocument?: string;
};

function rowsFromRecent(json: any): FilingRow[] {
  const r = json?.filings?.recent;
  if (!r || !Array.isArray(r?.accessionNumber)) return [];
  const L = r.accessionNumber.length;
  const out: FilingRow[] = [];
  for (let i = 0; i < L; i++) {
    out.push({
      form: String(r.form[i] ?? ""),
      filingDate: String(r.filingDate[i] ?? ""),
      reportDate: r.reportDate?.[i] ?? undefined,
      acceptanceDateTime: r.acceptanceDateTime?.[i] ?? undefined,
      accessionNumber: String(r.accessionNumber[i] ?? ""),
      primaryDocument: r.primaryDocument?.[i] ?? undefined,
    });
  }
  return out;
}

function rowsFromYearFile(y: any): FilingRow[] {
  if (!y || !Array.isArray(y?.filings)) return [];
  return y.filings.map((f: any) => ({
    form: String(f.form ?? ""),
    filingDate: String(f.filingDate ?? ""),
    reportDate: f.reportDate ?? undefined,
    acceptanceDateTime: f.acceptanceDateTime ?? undefined,
    accessionNumber: String(f.accessionNumber ?? ""),
    primaryDocument: f.primaryDocument ?? undefined,
  }));
}

function uniqueByAcc(rows: FilingRow[]) {
  const seen = new Set<string>();
  const out: FilingRow[] = [];
  for (const r of rows) {
    const key = r.accessionNumber;
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

function matchesForm(r: FilingRow, formsSet?: Set<string>) {
  if (!formsSet || formsSet.size === 0) return true;
  const f = r.form?.toUpperCase() || "";
  if (formsSet.has(f)) return true;
  // allow coarse filters like "13D*" to catch 13D/A
  for (const token of formsSet) {
    if (token.endsWith("*")) {
      const base = token.slice(0, -1);
      if (f.startsWith(base)) return true;
    }
  }
  return false;
}

function isHtmlLike(p?: string) {
  const u = (p || "").toLowerCase();
  return u.endsWith(".htm") || u.endsWith(".html") || u.endsWith(".txt");
}

export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    const url = new URL(req.url);
    const start = toDate(url.searchParams.get("start") || "");
    const end   = toDate(url.searchParams.get("end") || "");
    const formsParam = (url.searchParams.get("forms") || "").trim();
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10)));
    const page  = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));

    const formsSet =
      formsParam
        ? new Set(formsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean))
        : undefined;

    const cik10 = padCIK(params.cik);
    const r = await fetch(SEC_JSON(cik10), {
      headers: { "User-Agent": UA, "Accept": "application/json" },
      cache: "no-store",
    });
    if (!r.ok) {
      return NextResponse.json({ error: `SEC fetch failed (${r.status})` }, { status: 502 });
    }
    const baseJson = await r.json();

    const companyName: string = baseJson?.name || baseJson?.entityType || "Company";
    const cikNum = parseInt(cik10, 10);

    // 1) recent
    let all: FilingRow[] = rowsFromRecent(baseJson);

    // 2) yearly files (merge EVERYTHING, then we’ll filter by date/forms)
    const files: { name: string; url: string }[] = Array.isArray(baseJson?.filings?.files)
      ? baseJson.filings.files.map((f: any) => ({
          name: String(f.name || ""),
          url: `https://data.sec.gov/submissions/${String(f.name || "")}`,
        }))
      : [];

    // If start/end are provided, we can loosely reduce the number of year files to fetch,
    // but to be safest, fetch all and then filter. (These files are small per company.)
    // Throttle a bit to be nice to SEC.
    const CHUNK = 4;
    for (let i = 0; i < files.length; i += CHUNK) {
      const slice = files.slice(i, i + CHUNK);
      const batch = await Promise.all(
        slice.map(async (f) => {
          try {
            const rr = await fetch(f.url, { headers: { "User-Agent": UA, "Accept": "application/json" }, cache: "no-store" });
            if (!rr.ok) return null;
            const j = await rr.json();
            return rowsFromYearFile(j);
          } catch {
            return null;
          }
        })
      );
      for (const rows of batch) {
        if (rows && rows.length) all.push(...rows);
      }
      // tiny delay
      if (i + CHUNK < files.length) await new Promise(res => setTimeout(res, 120));
    }

    // 3) de-dup & sort desc by filingDate
    all = uniqueByAcc(all).sort((a, b) => (a.filingDate < b.filingDate ? 1 : a.filingDate > b.filingDate ? -1 : 0));

    // 4) apply filters
    all = all.filter((row) => {
      if (!inRange(row.filingDate, start, end)) return false;
      if (!matchesForm(row, formsSet)) return false;
      return true;
    });

    // 5) paginate
    const total = all.length;
    const offset = (page - 1) * limit;
    const pageRows = all.slice(offset, offset + limit);

    // 6) map to client-friendly output
    const out = pageRows.map((row) => {
      const noDash = row.accessionNumber.replace(/-/g, "");
      const base = SEC_ARCH_BASE(cikNum, noDash);
      const primaryDocUrl =
        row.primaryDocument && isHtmlLike(row.primaryDocument)
          ? `${base}/${row.primaryDocument}`
          : `${base}/index.html`; // fallback to index

      return {
        cik: cik10,
        company: companyName,
        form: row.form,
        filed_at: row.filingDate,
        reported_at: row.reportDate || null,
        title: `${companyName} • ${row.form} • ${row.filingDate}`,
        accession: row.accessionNumber,
        source_url: base,
        primary_doc_url: primaryDocUrl,
        // helpful direct downloads (best-effort)
        downloads: {
          index: `${base}/index.html`,
          fullText: `${base}.txt`,
          primary: primaryDocUrl,
        },
      };
    });

    return NextResponse.json({
      meta: { cik: cik10, company: companyName, total, page, limit },
      data: out,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}