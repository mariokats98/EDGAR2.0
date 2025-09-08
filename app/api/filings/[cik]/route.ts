// app/api/filings/[cik]/route.ts
import { NextResponse } from "next/server";

const UA = process.env.SEC_USER_AGENT || "Herevna/1.0 (contact@example.com)";
const SEC_HEADERS = { "User-Agent": UA, "Accept": "application/json" };

type Filing = {
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument?: string;
};

function padCIK(cik: string) {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

function toDate(s?: string) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(+d) ? null : d;
}

function dateInRange(d: string, start?: string, end?: string) {
  const D = toDate(d);
  if (!D) return false;
  if (start) {
    const S = toDate(start);
    if (S && D < S) return false;
  }
  if (end) {
    const E = toDate(end);
    if (E && D > E) return false;
  }
  return true;
}

function normalizeForm(s: string) {
  return (s || "").trim().toUpperCase();
}

function makeDocLinks(cik10: string, accNo: string, primary?: string) {
  // accNo comes like 0000320193-24-000123 sometimes; we need digits only for path
  const accDigits = accNo.replace(/-/g, "");
  const cikInt = String(parseInt(cik10, 10));
  const base = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accDigits}`;
  const index = `${base}/${accNo}-index.htm`;
  const primaryDoc = primary ? `${base}/${primary}` : undefined;
  const txt = `${base}/${accDigits}.txt`;
  return { index, primaryDoc, txt, base };
}

// Pull “recent” plus ALL historical year shards from filings.files
async function fetchAllFilings(cik10: string) {
  const root = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const r = await fetch(root, { headers: SEC_HEADERS, cache: "no-store" });
  if (!r.ok) throw new Error(`SEC submissions failed: ${r.status}`);
  const j = await r.json();

  const out: Filing[] = [];

  // recent block
  const recent = j?.filings?.recent || {};
  const n = Math.min(
    recent?.accessionNumber?.length || 0,
    recent?.filingDate?.length || 0,
    recent?.form?.length || 0
  );
  for (let i = 0; i < n; i++) {
    out.push({
      form: String(recent.form[i] || ""),
      filingDate: String(recent.filingDate[i] || ""),
      accessionNumber: String(recent.accessionNumber[i] || ""),
      primaryDocument: String(recent.primaryDocument?.[i] || ""),
    });
  }

  // historical shards under filings.files
  const files = j?.filings?.files || [];
  for (const f of files) {
    const name = f?.name as string;
    const url = `https://data.sec.gov/submissions/${name}`;
    try {
      const rr = await fetch(url, { headers: SEC_HEADERS, cache: "no-store" });
      if (!rr.ok) continue;
      const jj = await rr.json();
      const rec = jj?.filings?.recent || {};
      const m = Math.min(
        rec?.accessionNumber?.length || 0,
        rec?.filingDate?.length || 0,
        rec?.form?.length || 0
      );
      for (let i = 0; i < m; i++) {
        out.push({
          form: String(rec.form[i] || ""),
          filingDate: String(rec.filingDate[i] || ""),
          accessionNumber: String(rec.accessionNumber[i] || ""),
          primaryDocument: String(rec.primaryDocument?.[i] || ""),
        });
      }
    } catch {
      // ignore shard errors
    }
  }

  return {
    company: j?.name || j?.entityType || "Company",
    cik: cik10,
    filings: out,
  };
}

// Optional insider name scan for 3/4/5 primary doc (cheap text search)
async function insiderMatch(primaryUrl: string, insider: string) {
  try {
    const r = await fetch(primaryUrl, { headers: { "User-Agent": UA } });
    if (!r.ok) return false;
    const raw = await r.text();
    const text = raw.replace(/<[^>]+>/g, " ").toLowerCase();
    return text.includes(insider.toLowerCase());
  } catch {
    return false;
  }
}

export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    const url = new URL(req.url);
    const cik10 = padCIK(params.cik || "");
    if (!/^\d{10}$/.test(cik10)) {
      return NextResponse.json({ error: "Invalid CIK" }, { status: 400 });
    }

    const start = url.searchParams.get("start") || undefined; // YYYY or YYYY-MM-DD
    const end = url.searchParams.get("end") || undefined;
    const formsParam = url.searchParams.get("forms") || ""; // e.g. "8-K,10-Q,10-K,13D,13G,6-K,3,4,5"
    const insider = (url.searchParams.get("insider") || "").trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(10, parseInt(url.searchParams.get("pageSize") || "10", 10)));

    const formsSet = new Set(
      formsParam
        .split(",")
        .map((s) => normalizeForm(s))
        .filter(Boolean)
    );

    const { company, cik, filings } = await fetchAllFilings(cik10);

    // Filter by date
    let filtered = filings.filter((f) => dateInRange(f.filingDate, start, end));

    // Filter by forms (if provided)
    if (formsSet.size > 0) {
      filtered = filtered.filter((f) => formsSet.has(normalizeForm(f.form)));
    }

    // Sort newest → oldest
    filtered.sort((a, b) => {
      const da = toDate(a.filingDate)?.getTime() || 0;
      const db = toDate(b.filingDate)?.getTime() || 0;
      return db - da;
    });

    // INSIDER filter: only for 3/4/5; quick scan of primary doc text
    if (insider) {
      const keep: Filing[] = [];
      for (const f of filtered) {
        const formU = normalizeForm(f.form);
        if (!/^3|4|5$/.test(formU)) continue;
        const links = makeDocLinks(cik, f.accessionNumber, f.primaryDocument);
        if (!links.primaryDoc) continue;
        const ok = await insiderMatch(links.primaryDoc, insider);
        if (ok) keep.push(f);
      }
      filtered = keep;
    }

    const total = filtered.length;
    const startIdx = (page - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize).map((f) => {
      const links = makeDocLinks(cik, f.accessionNumber, f.primaryDocument);
      return {
        cik,
        company,
        form: f.form,
        filed_at: f.filingDate,
        accession: f.accessionNumber,
        primary_doc: f.primaryDocument || null,
        links: {
          index: links.index,          // HTML index
          primary_doc: links.primaryDoc || null, // original HTML/TXT document
          full_txt: links.txt,         // complete text file
        },
      };
    });

    return NextResponse.json({
      company,
      cik,
      page,
      pageSize,
      total,
      data: pageItems,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}