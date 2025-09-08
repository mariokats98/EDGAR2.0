import { NextResponse } from "next/server";

/** ---------- Runtime & caching ---------- */
export const runtime = "nodejs";         // avoid Edge’s relative URL quirks
export const dynamic = "force-dynamic";  // no caching of API results

/** ---------- SEC request headers ---------- */
const DEFAULT_UA = "Herevna/1.0 (contact@example.com)";
const SEC_UA = process.env.SEC_USER_AGENT || DEFAULT_UA;
const SEC_JSON_HEADERS = {
  "User-Agent": SEC_UA,
  "Accept": "application/json",
};
const SEC_TEXT_HEADERS = {
  "User-Agent": SEC_UA,
  "Accept": "text/html, text/plain",
};

/** ---------- Helpers ---------- */
function zeroPadCIK(cik: string) {
  const digits = String(cik).replace(/\D/g, "");
  return digits.padStart(10, "0");
}

function isHtmlLike(url: string) {
  const u = url.toLowerCase();
  return u.endsWith(".htm") || u.endsWith(".html") || u.endsWith(".txt");
}

function parseISO(d?: string | null) {
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isFinite(t) ? new Date(t) : null;
}

function withinRange(when: string, start?: string, end?: string) {
  const d = parseISO(when);
  if (!d) return false;
  if (start && d < new Date(start)) return false;
  if (end && d > new Date(end)) return false;
  return true;
}

function normForm(f: string) {
  return f.trim().toUpperCase();
}

function formMatches(target: string, selected: Set<string>) {
  if (selected.size === 0) return true;
  const F = normForm(target);

  // loose matching: exact, startsWith (to include amendments), and common aliases
  for (const s of selected) {
    if (F === s) return true;
    if (F.startsWith(s + "/A")) return true;
    if (F.startsWith(s)) return true;

    // some friendly groupings users commonly expect
    if ((s === "13D" || s === "SC 13D") && (F.startsWith("SC 13D"))) return true;
    if ((s === "13G" || s === "SC 13G") && (F.startsWith("SC 13G"))) return true;
    if (s === "S-1" && (F.startsWith("S-1") || F.startsWith("424B"))) return true;
  }
  return false;
}

function makeBaseUrl(cikNum: number, accessionNoNoDashes: string) {
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionNoNoDashes}`;
}

function stripHtmlToText(htmlOrText: string) {
  // crude but effective for simple scanning
  return htmlOrText.replace(/<style[\s\S]*?<\/style>/gi, " ")
                   .replace(/<script[\s\S]*?<\/script>/gi, " ")
                   .replace(/<[^>]+>/g, " ")
                   .replace(/\s+/g, " ")
                   .trim();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(id);
  }
}

/** Scan a 3/4/5 filing for a reporting person match */
async function matchesInsiderName(primaryDocUrl: string, insiderQ: string): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(primaryDocUrl, { headers: SEC_TEXT_HEADERS }, 8000);
    if (!r.ok) return false;
    const raw = await r.text();
    const text = stripHtmlToText(raw).toLowerCase();

    const q = insiderQ.toLowerCase().trim();
    if (!q) return true;

    // prioritize matches around “Reporting Person” area, but also allow global contains
    if (text.includes("reporting person") && text.includes(q)) return true;
    // also common labels
    if (text.includes("name and address of reporting person") && text.includes(q)) return true;
    // fallback: simple contains
    if (text.includes(q)) return true;

    return false;
  } catch {
    return false;
  }
}

/** ---------- Main handler ---------- */
export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    // Robust URL parsing (works if req.url is relative in some runtimes)
    const reqUrl = (() => {
      try { return new URL(req.url); }
      catch { return new URL(req.url, "http://localhost"); }
    })();

    const cikParam = params.cik || "";
    const cik10 = zeroPadCIK(cikParam);
    const cikNumeric = parseInt(cik10, 10);

    // query params
    const formsParam = (reqUrl.searchParams.get("forms") || "").trim();
    const start = reqUrl.searchParams.get("start") || "";     // e.g., "1999-01-01"
    const end = reqUrl.searchParams.get("end") || "";         // e.g., "2025-12-31"
    const q = (reqUrl.searchParams.get("q") || "").trim();    // insider name text
    const page = Math.max(1, parseInt(reqUrl.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(reqUrl.searchParams.get("pageSize") || "20", 10)));

    // normalize selected forms
    const formSet = new Set<string>(
      formsParam
        ? formsParam.split(",").map(s => normForm(s)).filter(Boolean)
        : []
    );

    // fetch master submissions file
    const subUrl = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    const subResp = await fetchWithTimeout(subUrl, { headers: SEC_JSON_HEADERS, cache: "no-store" }, 12000);
    if (!subResp.ok) {
      return NextResponse.json({ error: `SEC fetch failed (${subResp.status})` }, { status: 502 });
    }
    const subData = await subResp.json();

    const companyName = subData?.name || subData?.entityType || "Company";
    const recent = subData?.filings?.recent ?? {};
    const count = Math.min(
      (recent?.accessionNumber?.length || 0),
      2000 // cap scan to a reasonable number
    );

    type Row = {
      cik: string;
      company: string;
      form: string;
      filed_at: string;
      accession: string;
      title: string;
      primary_doc: string | null;
      source_base: string;
      download: {
        index_html?: string;
        primary_doc?: string;
        full_txt?: string;
      };
    };

    const rows: Row[] = [];

    for (let i = 0; i < count; i++) {
      const form = String(recent.form[i] || "").toUpperCase().trim();
      const filed_at = String(recent.filingDate[i] || "").trim();
      const accWithDashes = String(recent.accessionNumber[i] || "").trim();
      const acc = accWithDashes.replace(/-/g, "");
      const primary = String(recent.primaryDocument[i] || "").trim();

      if (!form || !filed_at || !acc) continue;

      // Filter by date
      if ((start || end) && !withinRange(filed_at, start || undefined, end || undefined)) {
        continue;
      }

      // Filter by form
      if (!formMatches(form, formSet)) continue;

      const base = makeBaseUrl(cikNumeric, acc);
      const primaryUrl = primary ? `${base}/${primary}` : null;

      rows.push({
        cik: cik10,
        company: companyName,
        form,
        filed_at,
        accession: accWithDashes,
        title: `${companyName} • ${form} • ${filed_at}`,
        primary_doc: primaryUrl,
        source_base: base,
        download: {
          index_html: `${base}/index.html`,
          primary_doc: primaryUrl || undefined,
          full_txt: `${base}/${accWithDashes}.txt`.replace(/--/g, "-"),
        },
      });
    }

    // Optional insider name filtering (only makes sense for 3/4/5)
    let filtered: Row[] = rows;
    if (q) {
      // If the form filter didn't restrict to 3/4/5, we will focus on 3/4/5 automatically for name search
      const lookingOnlyAtInsider =
        formSet.size === 0 ||
        Array.from(formSet).some(f => ["3", "4", "5", "FORM 3", "FORM 4", "FORM 5"].includes(f));

      const candidates = rows.filter(r => {
        if (!lookingOnlyAtInsider) return true;
        const f = r.form;
        return f === "3" || f === "4" || f === "5" || f.startsWith("3/") || f.startsWith("4/") || f.startsWith("5/");
      });

      const matches: Row[] = [];
      // limit network load—scan top 250 candidates by recency
      const ordered = candidates.sort((a, b) => Date.parse(b.filed_at) - Date.parse(a.filed_at)).slice(0, 250);

      for (const r of ordered) {
        if (!r.primary_doc || !isHtmlLike(r.primary_doc)) continue;
        const ok = await matchesInsiderName(r.primary_doc, q);
        if (ok) matches.push(r);
      }
      filtered = matches;
    }

    // Sort newest → oldest
    filtered.sort((a, b) => Date.parse(b.filed_at) - Date.parse(a.filed_at));

    // Pagination
    const total = filtered.length;
    const startIdx = (page - 1) * pageSize;
    const pageData = filtered.slice(startIdx, startIdx + pageSize);

    return NextResponse.json({
      cik: cik10,
      company: companyName,
      total,
      page,
      pageSize,
      hasMore: startIdx + pageSize < total,
      data: pageData.map(r => ({
        cik: r.cik,
        company: r.company,
        form: r.form,
        filed_at: r.filed_at,
        title: r.title,
        accession: r.accession,
        source_base: r.source_base,
        primary_doc_url: r.primary_doc,
        download_urls: r.download,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}