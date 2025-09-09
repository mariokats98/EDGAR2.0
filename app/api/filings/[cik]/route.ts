// app/api/filings/[cik]/route.ts
import { NextResponse } from "next/server";

const UA = process.env.SEC_USER_AGENT || "your-email@example.com (Herevna EDGAR client)";
const SEC_HOST = "https://www.sec.gov";
const SEC_TICKERS_URL = `${SEC_HOST}/files/company_tickers.json`;
const SUBMISSIONS_ROOT = `${SEC_HOST}/submissions/`;

/* ---------- helpers (same as before) ---------- */
function normalizeTickerLike(s: string) {
  return s.trim().toUpperCase().replace(/-/g, ".").replace(/\s+/g, " ");
}
type SecRow = { cik: string; ticker: string; name: string };
let _tickersCache: { rows: SecRow[]; at: number } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000;

async function loadSecTickers(): Promise<SecRow[]> {
  if (_tickersCache && Date.now() - _tickersCache.at < TTL_MS) return _tickersCache.rows;
  const r = await fetch(SEC_TICKERS_URL, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`SEC tickers fetch failed (${r.status})`);
  const j = (await r.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
  const rows: SecRow[] = Object.values(j).map(v => ({
    cik: String(v.cik_str).padStart(10, "0"),
    ticker: v.ticker.toUpperCase(),
    name: v.title,
  }));
  _tickersCache = { rows, at: Date.now() };
  return rows;
}
function scoreCandidate(q: string, row: SecRow): number {
  const t = row.ticker;
  const n = row.name.toUpperCase();
  let s = 0;
  if (t.startsWith(q)) s += 100;
  if (t === q) s += 50;
  const toks = q.split(/\s+/).filter(Boolean);
  for (const tok of toks) {
    if (n.startsWith(tok)) s += 25;
    if (n.includes(` ${tok}`)) s += 15;
    if (n.includes(tok)) s += 8;
  }
  if (n.includes(q)) s += 6;
  if (t.includes(q)) s += 5;
  return s;
}
async function resolveIdentifierToCIK(raw: string): Promise<string | null> {
  const q = raw.trim();
  if (!q) return null;
  if (/^\d{1,10}$/.test(q)) return q.padStart(10, "0");
  const rows = await loadSecTickers();
  const norm = normalizeTickerLike(q);
  const best = rows.map(r => ({ r, s: scoreCandidate(norm, r) })).sort((a, b) => b.s - a.s)[0];
  return best && best.s > 0 ? best.r.cik : null;
}

/* ---------- types ---------- */
type BaseRecord = {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string | null;
  form: string;
  primaryDocument?: string | null;
  primaryDocDescription?: string | null;
  companyName?: string | null;
  items?: string | null;
};
type SubmissionsJSON = {
  cik: string;
  name?: string;
  filings?: {
    recent?: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate?: (string | null)[];
      form: string[];
      primaryDocument?: (string | null)[];
      primaryDocDescription?: (string | null)[];
      items?: (string | null)[];
    };
    files?: { name: string }[];
  };
};
type Row = {
  cik: string;
  company?: string;
  form: string;
  filed: string;
  accessionNumber: string; // dashed
  open: string;            // absolute URL to primary doc (or index fallback)
};

/* ---------- fetch helpers ---------- */
async function fetchJson(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  return r.json();
}
function undash(acc: string) { return acc.replace(/-/g, ""); }
function stripLeadingZeros(cik: string) { return String(parseInt(cik, 10)); }
function indexHtmlUrl(cikPadded: string, accessionDashed: string) {
  const cikNoPad = stripLeadingZeros(cikPadded);
  const accNoDash = undash(accessionDashed);
  return `${SEC_HOST}/Archives/edgar/data/${cikNoPad}/${accNoDash}/${accNoDash}-index.htm`;
}
function primaryUrl(cikPadded: string, accessionDashed: string, primary?: string | null) {
  const cikNoPad = stripLeadingZeros(cikPadded);
  const accNoDash = undash(accessionDashed);
  if (primary) return `${SEC_HOST}/Archives/edgar/data/${cikNoPad}/${accNoDash}/${primary}`;
  return indexHtmlUrl(cikPadded, accessionDashed);
}

/* ---------- load filings (recent + historical chunks) ---------- */
async function loadAllFilingsForCIK(cikPadded: string): Promise<BaseRecord[]> {
  const url = `${SUBMISSIONS_ROOT}CIK${cikPadded}.json`;
  const root = (await fetchJson(url)) as SubmissionsJSON;
  const out: BaseRecord[] = [];
  const companyName = root.name || undefined;

  const rec = root?.filings?.recent;
  if (rec?.accessionNumber?.length) {
    for (let i = 0; i < rec.accessionNumber.length; i++) {
      out.push({
        accessionNumber: rec.accessionNumber[i],
        filingDate: rec.filingDate[i],
        reportDate: rec.reportDate?.[i] ?? null,
        form: rec.form[i],
        primaryDocument: rec.primaryDocument?.[i] ?? null,
        primaryDocDescription: rec.primaryDocDescription?.[i] ?? null,
        companyName,
        items: rec.items?.[i] ?? null,
      });
    }
  }

  const files = root?.filings?.files || [];
  for (const f of files) {
    try {
      const j = (await fetchJson(`${SUBMISSIONS_ROOT}${f.name}`)) as {
        filings?: { recent?: SubmissionsJSON["filings"]["recent"] };
        name?: string;
      };
      const r2 = j?.filings?.recent;
      if (r2?.accessionNumber?.length) {
        for (let i = 0; i < r2.accessionNumber.length; i++) {
          out.push({
            accessionNumber: r2.accessionNumber[i],
            filingDate: r2.filingDate[i],
            reportDate: r2.reportDate?.[i] ?? null,
            form: r2.form[i],
            primaryDocument: r2.primaryDocument?.[i] ?? null,
            primaryDocDescription: r2.primaryDocDescription?.[i] ?? null,
            companyName: j?.name || companyName,
            items: r2.items?.[i] ?? null,
          });
        }
      }
    } catch { /* ignore a single-year fetch error */ }
  }
  return out;
}

/* ---------- filters & map ---------- */
function withinDate(d: string, start: string, end: string) { return d >= start && d <= end; }
function matchesFreeText(rec: BaseRecord, q: string) {
  const L = q.toLowerCase();
  return (
    rec.form?.toLowerCase().includes(L) ||
    (rec.primaryDocument || "").toLowerCase().includes(L) ||
    (rec.primaryDocDescription || "").toLowerCase().includes(L) ||
    (rec.items || "").toLowerCase().includes(L)
  );
}
function toRow(cikPadded: string, rec: BaseRecord): Row {
  const open = primaryUrl(cikPadded, rec.accessionNumber, rec.primaryDocument || null);
  return {
    cik: cikPadded,
    company: rec.companyName || undefined,
    form: rec.form,
    filed: rec.filingDate,
    accessionNumber: rec.accessionNumber,
    open,
  };
}

/* ---------- handler ---------- */
export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    const idRaw = decodeURIComponent(params.cik || "").trim();
    if (!idRaw) return NextResponse.json({ ok: false, error: "Missing identifier. Provide CIK, ticker, or company name." }, { status: 400 });

    const resolvedCIK = await resolveIdentifierToCIK(idRaw);
    if (!resolvedCIK) return NextResponse.json({ ok: false, error: "Ticker/Company not recognized. Pick from suggestions or enter a numeric CIK." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start") || "2000-01-01";
    const end = searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const forms = (searchParams.get("forms") || "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const perPage = Math.min(200, Math.max(1, parseInt(searchParams.get("perPage") || "50", 10)));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const freeText = (searchParams.get("q") || "").trim() || null;

    const all = await loadAllFilingsForCIK(resolvedCIK);

    let filtered = all.filter(r => r.filingDate && withinDate(r.filingDate, start, end));
    if (forms.length) {
      const set = new Set(forms.map(f => f.toUpperCase()));
      filtered = filtered.filter(r => set.has(r.form.toUpperCase()));
    }
    if (freeText) filtered = filtered.filter(r => matchesFreeText(r, freeText));

    filtered.sort((a, b) => (a.filingDate < b.filingDate ? 1 : -1));

    const total = filtered.length;
    const startIdx = (page - 1) * perPage;
    const pageItems = filtered.slice(startIdx, startIdx + perPage);
    const rows = pageItems.map(rec => toRow(resolvedCIK, rec));

    return NextResponse.json({
      ok: true,
      total,
      count: rows.length,
      data: rows,
      query: { id: idRaw, resolvedCIK, start, end, forms, perPage, page, freeText }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}