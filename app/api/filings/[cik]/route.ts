import { NextRequest, NextResponse } from "next/server";

/** Types returned to the UI */
type FilingRow = {
  form: string;
  filingDate: string;
  reportDate?: string;
  accessionNumber: string;
  primaryDocument: string;
  title?: string;
  links: { view: string; download: string };
};

type Meta = {
  cik: string;
  name: string;
  page: number;
  pageSize: number;
  total: number;
};

const UA =
  process.env.SEC_USER_AGENT ||
  "herevna.io contact@herevna.io (EDGAR2.0)";

/** Soft date validator: allows YYYY, YYYY-MM, YYYY-MM-DD. Returns normalized YYYY-MM-DD or null. */
function normalizeDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const s = d.trim();
  if (!s) return null;
  // YYYY
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  // YYYY-MM
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return `${s}-01`;
  // YYYY-MM-DD
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)) return s;
  // Anything else -> ignore instead of throwing
  return null;
}

/** Compare ISO date strings safely */
function isOnOrAfter(a: string, b: string) {
  return a.localeCompare(b) >= 0;
}
function isOnOrBefore(a: string, b: string) {
  return a.localeCompare(b) <= 0;
}

/** Build SEC archive links */
function buildLinks(cik10: string, accessionWithDashes: string, primaryDoc: string) {
  const accNoNoDashes = accessionWithDashes.replace(/-/g, "");
  const view = `https://www.sec.gov/Archives/edgar/data/${Number(cik10)}/${accNoNoDashes}/${accNoNoDashes}-index.html`;
  const download = `https://www.sec.gov/Archives/edgar/data/${Number(cik10)}/${accNoNoDashes}/${primaryDoc}`;
  return { view, download };
}

/** Fetch the company submissions file (recent filings) */
async function fetchSubmissions(cik10: string) {
  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
    },
    // never cache on the edge; we want fresh-ish
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`SEC submissions fetch failed (${r.status})`);
  }
  return r.json();
}

/** GET /api/filings/[cik]?form=10-K,8-K&start=YYYY|YYYY-MM|YYYY-MM-DD&end=...&owner=...&page=1&pageSize=25 */
export async function GET(req: NextRequest, { params }: { params: { cik: string } }) {
  try {
    const { searchParams } = new URL(req.url);

    // --- normalize CIK ---
    let cikRaw = (params?.cik || "").trim();
    // If user passed a ticker or name here by mistake, we bail early with a friendly error.
    if (!/^\d{1,10}$/.test(cikRaw)) {
      return NextResponse.json({ error: "CIK must be 1–10 digits." }, { status: 400 });
    }
    const cik10 = cikRaw.padStart(10, "0");

    // --- filters ---
    const formsParam = (searchParams.get("form") || "").trim();
    const forms = formsParam
      ? formsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : [];
    const start = normalizeDate(searchParams.get("start"));
    const end = normalizeDate(searchParams.get("end"));
    const owner = (searchParams.get("owner") || "").trim(); // NOTE: for 3/4/5, we’d need per-filing fetch to match owners; we soft-ignore here.

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));

    // --- fetch recent filings from SEC submissions file ---
    const json = await fetchSubmissions(cik10);

    const entityName: string =
      json?.entityType && json?.name
        ? String(json.name)
        : String(json?.name || "Unknown");

    // recent arrays are parallel: accessionNumber[], filingDate[], form[], primaryDocument[], reportDate[], primaryDocDescription[]
    const recent = json?.filings?.recent;
    const N: number = Array.isArray(recent?.accessionNumber) ? recent.accessionNumber.length : 0;

    const rows: FilingRow[] = [];
    for (let i = 0; i < N; i++) {
      const form = String(recent.form?.[i] || "");
      const filingDate = String(recent.filingDate?.[i] || "");
      const reportDate = recent.reportDate?.[i] ? String(recent.reportDate[i]) : undefined;
      const accessionNumber = String(recent.accessionNumber?.[i] || "");
      const primaryDocument = String(recent.primaryDocument?.[i] || "");
      const primaryDocDescription = recent.primaryDocDescription?.[i]
        ? String(recent.primaryDocDescription[i])
        : undefined;

      // form filter
      if (forms.length && !forms.includes(form.toUpperCase())) continue;

      // date filters (compare ISO)
      if (start && filingDate && !isOnOrAfter(filingDate, start)) continue;
      if (end && filingDate && !isOnOrBefore(filingDate, end)) continue;

      // (Optional) rudimentary owner filter: only allow through for 3/4/5.
      // A true owner-name filter requires fetching each doc and parsing; we skip that here to keep responses fast.
      if (owner && !["3", "4", "5", "FORM 3", "FORM 4", "FORM 5"].includes(form.toUpperCase())) {
        continue;
      }

      rows.push({
        form,
        filingDate,
        reportDate,
        accessionNumber,
        primaryDocument,
        title: primaryDocDescription,
        links: buildLinks(cik10, accessionNumber, primaryDocument),
      });
    }

    // --- (Optional) extend with historical batches here ---
    // If you had logic building `historicRows`, make sure it is strongly typed:
    // const historicRows: FilingRow[] = [];
    // const lists: FilingRow[][] = await Promise.all(tasksReturningFilingRowArrays);
    // for (const list of lists) if (Array.isArray(list)) historicRows.push(...list);
    // rows.push(...historicRows);

    // sort newest → oldest
    rows.sort((a, b) => b.filingDate.localeCompare(a.filingDate));

    const total = rows.length;
    const startIdx = (page - 1) * pageSize;
    const pageRows = rows.slice(startIdx, startIdx + pageSize);

    const meta: Meta = {
      cik: cik10,
      name: entityName,
      page,
      pageSize,
      total,
    };

    return NextResponse.json({ data: pageRows, meta }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}