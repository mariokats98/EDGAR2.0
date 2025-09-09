// app/api/filings/[cik]/route.ts
import { NextResponse } from "next/server";

/* =============================
   Config & small shared helpers
   ============================= */

const UA =
  process.env.SEC_USER_AGENT ||
  "your-email@example.com (Herevna EDGAR client)";

const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const EFTS_URL = "https://efts.sec.gov/LATEST/search-index"; // official search endpoint

// normalize e.g. "brk-b" => "BRK.B"
function normalizeTickerLike(s: string) {
  return s.trim().toUpperCase().replace(/-/g, ".").replace(/\s+/g, " ");
}

// in-memory cache for SEC tickers per serverless instance
type SecRow = { cik: string; ticker: string; name: string };
let _tickersCache: { rows: SecRow[]; at: number } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

async function loadSecTickers(): Promise<SecRow[]> {
  if (_tickersCache && Date.now() - _tickersCache.at < TTL_MS) {
    return _tickersCache.rows;
  }
  const r = await fetch(SEC_TICKERS_URL, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`SEC tickers fetch failed (${r.status})`);
  }
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
  // Lightweight fuzzy scoring: prioritise ticker startsWith, exact, name token hits
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

/** Accepts ticker / company / CIK -> returns a padded 10-char CIK (or null) */
async function resolveIdentifierToCIK(raw: string): Promise<string | null> {
  const q = raw.trim();
  if (!q) return null;

  // numeric CIK straight through
  if (/^\d{1,10}$/.test(q)) return q.padStart(10, "0");

  const rows = await loadSecTickers();
  const norm = normalizeTickerLike(q);

  const best = rows
    .map((r) => ({ r, s: scoreCandidate(norm, r) }))
    .sort((a, b) => b.s - a.s)[0];

  if (!best || best.s <= 0) return null;
  return best.r.cik;
}

/* =============================
   Types for our API response
   ============================= */

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

/* =========================================
   Build file/dir links from an EFTS hit row
   ========================================= */

function stripDashes(acc: string) {
  return acc.replace(/-/g, "");
}

function inferDirFromUrl(url: string): string {
  // EFTS "url" looks like: /Archives/edgar/data/0000320193/000032019324000123/...
  // We strip the filename to get the dir.
  const lastSlash = url.lastIndexOf("/");
  return lastSlash > 0 ? url.slice(0, lastSlash + 1) : url;
}

function buildRowFromEftsHit(hit: any): Row | null {
  // EFTS items typically carry: form, filingDate, companyName, cik, accessionNo, url, primaryDocument
  const form = hit?.form || hit?.formType;
  const filed = hit?.filedAt || hit?.filingDate || hit?.fileDate;
  const cikRaw = (hit?.cik || "").toString().padStart(10, "0");
  const company = hit?.displayNames?.[0] || hit?.companyName || undefined;

  // The accession may be with dashes or without, try to standardize to dashed if present
  let acc = hit?.accessionNo || hit?.adsh || hit?.accessionNumber || "";
  if (!acc) {
    // Fallback: some payloads only include the URL path. Try to extract accession from there.
    // e.g. /Archives/edgar/data/320193/000032019324000123/...
    const m = (hit?.url || "").match(/\/data\/\d+\/(\d{18,})\//);
    if (m) {
      const undashed = m[1];
      // Try to format as 10-2-6 if length 18
      if (undashed.length === 18) {
        acc = `${undashed.slice(0, 10)}-${undashed.slice(10, 12)}-${undashed.slice(12)}`;
      } else {
        acc = undashed; // as-is
      }
    }
  }

  const accessionDashed = acc.includes("-")
    ? acc
    : acc.length === 18
    ? `${acc.slice(0, 10)}-${acc.slice(10, 12)}-${acc.slice(12)}`
    : acc;

  // Folder directory & primary document path
  const url = hit?.url || ""; // e.g. "/Archives/edgar/data/320193/000032019324000123/primary_doc.xml"
  const dir = inferDirFromUrl(url);
  const undashed = stripDashes(accessionDashed);
  const indexHtml = `/Archives/edgar/data/${parseInt(cikRaw, 10)}/${undashed}/${undashed}-index.htm`;
  const primary =
    hit?.primaryDocument && dir
      ? `${dir}${hit.primaryDocument}`
      : // fallback to url if present
        url;

  return {
    cik: cikRaw,
    company,
    form: form || "—",
    filed: filed || "—",
    accessionNumber: accessionDashed || "—",
    links: {
      indexHtml,
      dir,
      primary,
    },
    download: primary || indexHtml,
  };
}

/* =======================
   EFTS (SEC search) call
   ======================= */

async function searchEfts(params: {
  cik?: string | null;
  start: string;
  end: string;
  forms: string[];
  freeText?: string | null;
  from: number; // zero-based offset
  size: number; // page size (<= 200 recommended)
}) {
  const body: any = {
    category: "custom", // enables passing specific filters
    startdt: params.start,
    enddt: params.end,
    // `keys` is the general search box. If we provide CIK filter, we can keep keys minimal (or use freeText).
    keys: params.freeText ? params.freeText : "",
    forms: params.forms && params.forms.length ? params.forms : undefined,
    ciks: params.cik ? [params.cik] : undefined,
    from: params.from,
    size: params.size,
    // sort by filing date desc by default
    sortField: "filedAt",
    sortOrder: "desc",
  };

  // Clean undefined fields (SEC endpoint is picky sometimes)
  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

  const r = await fetch(EFTS_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://www.sec.gov", // helps with some SEC edge cases
      Referer: "https://www.sec.gov/",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`SEC search failed (${r.status}) ${txt.slice(0, 200)}`);
  }

  const j = (await r.json()) as {
    hits: { total: { value: number }; hits: any[] };
  };

  const total = j?.hits?.total?.value || 0;
  const hits = (j?.hits?.hits || []).map((h: any) => h?._source || h?.source || h);

  return { total, items: hits };
}

/* ============
   API handler
   ============ */

export async function GET(
  req: Request,
  { params }: { params: { cik: string } }
) {
  try {
    const idRaw = decodeURIComponent(params.cik || "").trim();
    const { searchParams } = new URL(req.url);

    // inputs
    const start = searchParams.get("start") || "2000-01-01";
    const end = searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const formsParam = (searchParams.get("forms") || "").trim();
    const forms = formsParam
      ? formsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : []; // empty = any form
    const perPage = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("perPage") || "50", 10))
    );
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const freeText = (searchParams.get("q") || "").trim() || null;

    // Resolve identifier to CIK (ticker / company / cik all allowed)
    const resolvedCIK = await resolveIdentifierToCIK(idRaw);
    if (!resolvedCIK) {
      return NextResponse.json(
        { ok: false, error: "Ticker/Company not recognized. Pick from suggestions or enter a numeric CIK." },
        { status: 400 }
      );
    }

    // EFTS uses 0-based "from" offset
    const from = (page - 1) * perPage;

    const { total, items } = await searchEfts({
      cik: resolvedCIK,
      start,
      end,
      forms,
      freeText,
      from,
      size: perPage,
    });

    const rows: Row[] = [];
    for (const it of items) {
      const row = buildRowFromEftsHit(it);
      if (row) rows.push(row);
    }

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

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}