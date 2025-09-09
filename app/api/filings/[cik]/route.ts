// app/api/filings/[cik]/route.ts
import { NextResponse } from "next/server";

/** ==========
 *  Config
 *  ========== */
const UA =
  process.env.SEC_USER_AGENT ||
  "your-email@example.com (Herevna EDGAR client)";

const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_ROOT = "https://data.sec.gov/submissions/";

/** =====================================
 *  Small helpers: normalize & fuzzy match
 *  ===================================== */
function normalizeTickerLike(s: string) {
  return s.trim().toUpperCase().replace(/-/g, ".").replace(/\s+/g, " ");
}

type SecRow = { cik: string; ticker: string; name: string };
let _tickersCache: { rows: SecRow[]; at: number } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000;

async function loadSecTickers(): Promise<SecRow[]> {
  if (_tickersCache && Date.now() - _tickersCache.at < TTL_MS) {
    return _tickersCache.rows;
  }
  const r = await fetch(SEC_TICKERS_URL, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC tickers fetch failed (${r.status})`);
  const j = (await r.json()) as Record<
    string,
    { cik_str: number; ticker: string; title: string }
  >;
  const rows: SecRow[] = Object.values(j).map((v) => ({
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
  let score = 0;
  if (t.startsWith(q)) score += 100;
  if (t === q) score += 50;
  const tokens = q.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    if (n.startsWith(tok)) score += 25;
    if (n.includes(` ${tok}`)) score += 15;
    if (n.includes(tok)) score += 8;
  }
  if (n.includes(q)) score += 6;
  if (t.includes(q)) score += 5;
  return score;
}

/** Accepts ticker / company / CIK -> returns padded 10-char CIK (or null) */
async function resolveIdentifierToCIK(raw: string): Promise<string | null> {
  const q = raw.trim();
  if (!q) return null;
  if (/^\d{1,10}$/.test(q)) return q.padStart(10, "0");

  const rows = await loadSecTickers();
  const norm = normalizeTickerLike(q);
  const best = rows
    .map((r) => ({ r, s: scoreCandidate(norm, r) }))
    .sort((a, b) => b.s - a.s)[0];

  if (!best || best.s <= 0) return null;
  return best.r.cik;
}

/** ===========================
 *  Types & transformation
 *  =========================== */
type Row = {
  cik: string;
  company?: string;
  form: string;
  filed: string;
  accessionNumber: string; // dashed
  links: { indexHtml: string; dir: string; primary: string };
  download: string;
};

type ApiResult = {
  ok: true;
  total: number;
  count: number;
  data: Row[];
  query: {
    id: string;
    resolvedCIK: string | null;
    start: string;
    end: string;
    forms: string[];
    perPage: number;
    page: number;
    freeText: string | null;
  };
};

function undash(acc: string) {
  return acc.replace(/-/g, "");
}

function stripLeadingZeros(cik: string) {
  return String(parseInt(cik, 10));
}

function toIndexHtml(cikPadded: string, accessionDashed: string) {
  const cikNoPad = stripLeadingZeros(cikPadded);
  const accNoDash = undash(accessionDashed);
  return `/Archives/edgar/data/${cikNoPad}/${accNoDash}/${accNoDash}-index.htm`;
}

function toPrimaryPath(
  cikPadded: string,
  accessionDashed: string,
  primaryDocument?: string | null
) {
  const cikNoPad = stripLeadingZeros(cikPadded);
  const accNoDash = undash(accessionDashed);
  if (primaryDocument) {
    return `/Archives/edgar/data/${cikNoPad}/${accNoDash}/${primaryDocument}`;
  }
  // fallback to index if doc unknown
  return toIndexHtml(cikPadded, accessionDashed);
}

/** ===========================
 *  Fetch submissions (recent + old)
 *  =========================== */
type BaseRecord = {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string | null;
  form: string;
  primaryDocument?: string | null;
  primaryDocDescription?: string | null;
  companyName?: string | null;
  items?: string | null; // 8-K items text
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
      // sometimes includes 'items'
      items?: (string | null)[];
    };
    files?: { name: string; filingCount: number; filingFrom: string; filingTo: string }[];
  };
};

async function fetchJson(url: string) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  return r.json();
}

async function loadAllFilingsForCIK(cikPadded: string): Promise<BaseRecord[]> {
  const url = `${SUBMISSIONS_ROOT}CIK${cikPadded}.json`;
  const root = (await fetchJson(url)) as SubmissionsJSON;

  const out: BaseRecord[] = [];
  const companyName = root.name || undefined;

  // recent arrays
  const rec = root?.filings?.recent;
  if (rec && rec.accessionNumber?.length) {
    const n = rec.accessionNumber.length;
    for (let i = 0; i < n; i++) {
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

  // historical files (older chunks)
  const files = root?.filings?.files || [];
  for (const f of files) {
    // Each 'name' is like "CIK0000320193-submissions-2020.json"
    const histUrl = `${SUBMISSIONS_ROOT}${f.name}`;
    try {
      const j = (await fetchJson(histUrl)) as {
        filings: {
          files?: any[]; // not used
          recent?: SubmissionsJSON["filings"]["recent"];
        };
        name?: string;
      };
      const r2 = j?.filings?.recent;
      if (r2 && r2.accessionNumber?.length) {
        const m = r2.accessionNumber.length;
        for (let i = 0; i < m; i++) {
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
    } catch {
      // ignore a single year failure; continue
    }
  }

  return out;
}

/** ===========================
 *  Filtering & mapping
 *  =========================== */
function withinDate(d: string, start: string, end: string) {
  return d >= start && d <= end;
}

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
  const accDashed = rec.accessionNumber;
  const indexHtml = toIndexHtml(cikPadded, accDashed);
  const primary = toPrimaryPath(cikPadded, accDashed, rec.primaryDocument || null);
  return {
    cik: cikPadded,
    company: rec.companyName || undefined,
    form: rec.form,
    filed: rec.filingDate,
    accessionNumber: accDashed,
    links: {
      indexHtml,
      dir: indexHtml.replace(/[^/]+$/, ""), // parent folder
      primary,
    },
    download: primary,
  };
}

/** ============
 *  API handler
 *  ============ */
export async function GET(
  req: Request,
  { params }: { params: { cik: string } }
) {
  try {
    const idRaw = decodeURIComponent(params.cik || "").trim();
    if (!idRaw) {
      return NextResponse.json(
        { ok: false, error: "Missing identifier. Provide CIK, ticker, or company name." },
        { status: 400 }
      );
    }

    const resolvedCIK = await resolveIdentifierToCIK(idRaw);
    if (!resolvedCIK) {
      return NextResponse.json(
        { ok: false, error: "Ticker/Company not recognized. Pick from suggestions or enter a numeric CIK." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start") || "2000-01-01";
    const end = searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const formsParam = (searchParams.get("forms") || "").trim();
    const forms = formsParam
      ? formsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const perPage = Math.min(200, Math.max(1, parseInt(searchParams.get("perPage") || "50", 10)));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const freeText = (searchParams.get("q") || "").trim() || null;

    // Load all filings (recent + historical chunks)
    const all = await loadAllFilingsForCIK(resolvedCIK);

    // Filter
    let filtered = all.filter(
      (r) => r.filingDate && withinDate(r.filingDate, start, end)
    );
    if (forms.length) {
      const set = new Set(forms.map((f) => f.toUpperCase()));
      filtered = filtered.filter((r) => set.has(r.form.toUpperCase()));
    }
    if (freeText) {
      filtered = filtered.filter((r) => matchesFreeText(r, freeText));
    }

    // Sort newest first
    filtered.sort((a, b) => (a.filingDate < b.filingDate ? 1 : -1));

    const total = filtered.length;
    const startIdx = (page - 1) * perPage;
    const pageItems = filtered.slice(startIdx, startIdx + perPage);

    const rows: Row[] = pageItems.map((rec) => toRow(resolvedCIK, rec));

    const payload: ApiResult = {
      ok: true,
      total,
      count: rows.length,
      data: rows,
      query: {
        id: idRaw,
        resolvedCIK,
        start,
        end,
        forms,
        perPage,
        page,
        freeText,
      },
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}