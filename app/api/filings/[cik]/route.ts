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

function makeAccDigits(accNo: string) {
  return accNo.replace(/-/g, "");
}

function makeBasePaths(cik10: string, accNo: string) {
  const accDigits = makeAccDigits(accNo);
  const cikInt = String(parseInt(cik10, 10));
  const base = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accDigits}`;
  return { base, accDigits, cikInt };
}

function makeDocLinks(cik10: string, accNo: string, primary?: string) {
  const { base, accDigits } = makeBasePaths(cik10, accNo);
  const index = `${base}/${accNo}-index.htm`;
  const primaryDoc = primary ? `${base}/${primary}` : undefined;
  const txt = `${base}/${accDigits}.txt`;
  return { index, primaryDoc, txt, base };
}

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

  // historical shards
  const files = j?.filings?.files || [];
  for (const f of files) {
    const name = f?.name as string;
    if (!name) continue;
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
    } catch { /* ignore */ }
  }

  return {
    company: j?.name || j?.entityType || "Company",
    cik: cik10,
    filings: out,
  };
}

/* ---------------- Insider matching via XML ---------------- */

type IndexJson = {
  directory?: {
    item?: { name: string }[];
  };
};

// in-memory caches to keep requests down per invocation
const INDEX_CACHE = new Map<string, string[]>();   // key: base -> list of file names
const NAMES_CACHE = new Map<string, Set<string>>(); // key: base -> set of owner names

function normName(s: string) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")        // remove parentheses
    .replace(/[^a-z0-9\s]/g, " ")    // strip punctuation
    .replace(/\s+/g, " ")            // collapse whitespace
    .trim();
}

function tokens(s: string) {
  return normName(s).split(" ").filter(Boolean);
}

function nameMatches(query: string, candidates: Set<string>) {
  // Strategy: if user gives 2+ tokens, require that candidate contains all (loose).
  // If user gives 1 token (likely last name), require that token is present.
  const qTokens = tokens(query);
  if (qTokens.length === 0) return false;
  for (const cand of candidates) {
    const cTokens = tokens(cand);
    if (qTokens.length === 1) {
      if (cTokens.includes(qTokens[0])) return true;
      continue;
    }
    // multi-token: all q tokens must be present in candidate
    let all = true;
    for (const t of qTokens) {
      if (!cTokens.includes(t)) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

function extractOwnerNamesFromXML(xml: string): Set<string> {
  const out = new Set<string>();
  // Capture <rptOwnerName>NAME</rptOwnerName>
  const re = /<\s*rptOwnerName\s*>\s*([^<]+?)\s*<\/\s*rptOwnerName\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const name = m[1].trim();
    if (name) out.add(name);
  }
  return out;
}

function extractOwnerNamesFromHTML(html: string): Set<string> {
  // Fallback: try to grab a line after "Name and Address of Reporting Person"
  const text = html.replace(/<[^>]+>/g, "\n");
  const out = new Set<string>();
  const anchor = /name\s+and\s+address\s+of\s+reporting\s+person/i;
  const idx = text.search(anchor);
  if (idx >= 0) {
    const snippet = text.slice(idx, idx + 600); // small window
    // Grab uppercase-ish words, allow commas/space
    const cand = snippet.match(/[A-Z][A-Za-z'\-\.]+\s+[A-Z][A-Za-z'\-\.]+(?:\s+[A-Z][A-Za-z'\-\.]+)?/g);
    if (cand) {
      cand.slice(0, 5).forEach((s) => out.add(s.trim()));
    }
  }
  return out;
}

async function getIndexFiles(base: string): Promise<string[]> {
  if (INDEX_CACHE.has(base)) return INDEX_CACHE.get(base)!;
  const idxUrl = `${base}/index.json`;
  try {
    const r = await fetch(idxUrl, { headers: SEC_HEADERS, cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const j: IndexJson = await r.json();
    const files = (j?.directory?.item || []).map((it) => it.name).filter(Boolean);
    INDEX_CACHE.set(base, files);
    return files;
  } catch {
    INDEX_CACHE.set(base, []);
    return [];
  }
}

async function getOwnerNamesFromFiling(base: string, primaryDoc?: string): Promise<Set<string>> {
  if (NAMES_CACHE.has(base)) return NAMES_CACHE.get(base)!;

  const names = new Set<string>();
  const files = await getIndexFiles(base);

  // Prefer XML ownership docs
  const xmlCandidates = files.filter((f) =>
    /\.xml$/i.test(f) && /owner|ownership|primary/i.test(f)
  );
  // Also consider any xml if none matched
  const allXml = xmlCandidates.length ? xmlCandidates : files.filter((f) => /\.xml$/i.test(f));

  // Try XML first
  for (const f of allXml.slice(0, 5)) {
    try {
      const url = `${base}/${f}`;
      const r = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
      if (!r.ok) continue;
      const xml = await r.text();
      const found = extractOwnerNamesFromXML(xml);
      found.forEach((n) => names.add(n));
      if (names.size > 0) break; // good enough
    } catch { /* ignore */ }
  }

  // Fallback: try primary HTML/TXT
  if (names.size === 0 && primaryDoc) {
    try {
      const url = `${base}/${primaryDoc}`;
      const r = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
      if (r.ok) {
        const html = await r.text();
        const fromHtml = extractOwnerNamesFromHTML(html);
        fromHtml.forEach((n) => names.add(n));
      }
    } catch { /* ignore */ }
  }

  NAMES_CACHE.set(base, names);
  return names;
}

/* ---------------- Route ---------------- */

export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    const url = new URL(req.url);
    const cik10 = padCIK(params.cik || "");
    if (!/^\d{10}$/.test(cik10)) {
      return NextResponse.json({ error: "Invalid CIK" }, { status: 400 });
    }

    const start = url.searchParams.get("start") || undefined; // YYYY or YYYY-MM-DD
    const end = url.searchParams.get("end") || undefined;
    const formsParam = url.searchParams.get("forms") || "";
    const insiderQ = (url.searchParams.get("insider") || "").trim();
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

    // INSIDER filter — robust: use XML owner names (forms 3/4/5)
    if (insiderQ) {
      const keep: Filing[] = [];
      for (const f of filtered) {
        const formU = normalizeForm(f.form);
        if (!/^(3|4|5)$/.test(formU)) continue;

        const { base } = makeBasePaths(cik, f.accessionNumber);
        const names = await getOwnerNamesFromFiling(base, f.primaryDocument);
        if (names.size === 0) continue;

        if (nameMatches(insiderQ, names)) {
          keep.push(f);
        }
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
          index: links.index,
          primary_doc: links.primaryDoc || null,
          full_txt: links.txt,
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