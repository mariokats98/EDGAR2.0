// app/api/filings/[cik]/route.ts
import { NextRequest, NextResponse } from "next/server";

const SEC_UA =
  process.env.SEC_USER_AGENT ||
  "herevna/filings (contact@herevna.io)";

type QueryOut = {
  id: string;
  resolvedCIK: string | null;
  start: string;
  end: string;
  forms: string[];
  perPage: number;
  page: number;
  freeText: string | null;
};

type RowOut = {
  cik: string;
  companyName?: string;
  form: string;
  filingDate: string;
  reportDate?: string;
  accessionNumber: string;
  primaryDocument: string;
  primaryDocDescription?: string;
  indexUrl: string;
  primaryUrl: string;
  downloadUrl: string;
};

/* -------------------- helpers -------------------- */

function padCIK(cik: string) {
  const d = cik.replace(/\D/g, "");
  return d.padStart(10, "0");
}

function isCIKLike(s: string) {
  return /^\d{1,10}$/.test(s.trim());
}

function normalizeName(s: string) {
  return s.replace(/[^\w\s\-&.]/g, "").toLowerCase();
}

function normalizeTicker(s: string) {
  // handle BRK.B / BRK-B etc.
  return s.toUpperCase().replace(/[^\w.]/g, "");
}

function buildUrls(cik10: string, accNo: string, primary: string) {
  const cikNoLead = String(parseInt(cik10, 10)); // strip leading zeros
  const accNoNoDash = accNo.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${cikNoLead}/${accNoNoDash}`;
  return {
    indexUrl: `${base}/${accNoNoDash}-index.html`,
    primaryUrl: `${base}/${primary}`,
    downloadUrl: `${base}/${accNoNoDash}.zip`,
  };
}

function toISO(d: string) {
  // expect YYYY-MM-DD already; fallback tolerant parse
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const x = new Date(d);
  if (isNaN(+x)) return "1900-01-01";
  return x.toISOString().slice(0, 10);
}

function inDateRange(iso: string, start: string, end: string) {
  return iso >= start && iso <= end;
}

function containsFreeText(fields: string[], q?: string | null) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((s) => (s || "").toLowerCase().includes(needle));
}

const SEC_JSON_HEADERS = {
  "User-Agent": SEC_UA,
  "Accept": "application/json; charset=utf-8",
  "X-Requested-With": "XMLHttpRequest",
} as const;

/* ------- cache SEC company_tickers.json in memory ------- */

type TickerRecord = {
  cik_str: number;
  ticker: string;
  title: string;
};

let TICKER_CACHE: {
  at: number;
  items: TickerRecord[];
} | null = null;

async function loadTickerIndex(): Promise<TickerRecord[]> {
  const now = Date.now();
  if (TICKER_CACHE && now - TICKER_CACHE.at < 6 * 60 * 60 * 1000) {
    return TICKER_CACHE.items;
  }
  const url = "https://www.sec.gov/files/company_tickers.json";
  const r = await fetch(url, { headers: SEC_JSON_HEADERS, cache: "no-store" });
  if (!r.ok) throw new Error(`SEC ticker index fetch failed (${r.status})`);
  const j = (await r.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
  const items = Object.values(j);
  TICKER_CACHE = { at: now, items };
  return items;
}

async function resolveIdentifierToCIK(id: string): Promise<{ cik10: string; name?: string } | null> {
  const raw = id.trim();
  if (!raw) return null;

  // numeric CIK
  if (isCIKLike(raw)) {
    return { cik10: padCIK(raw) };
  }

  const idx = await loadTickerIndex();

  // ticker exact (case-insensitive), normalize dots (e.g., BRK.B)
  const tickerNorm = normalizeTicker(raw);
  let m = idx.find((x) => normalizeTicker(x.ticker) === tickerNorm);
  if (m) return { cik10: padCIK(String(m.cik_str)), name: m.title };

  // company name contains
  const nameNorm = normalizeName(raw);
  m = idx.find((x) => normalizeName(x.title).includes(nameNorm));
  if (m) return { cik10: padCIK(String(m.cik_str)), name: m.title };

  return null;
}

/* ------------- fetch submissions for a CIK ------------- */

type RecentBlock = {
  accessNumber: string[];
  filingDate: string[];
  reportDate: (string | null)[];
  acceptanceDateTime: string[];
  act: (string | null)[];
  form: string[];
  fileNumber: (string | null)[];
  filmNumber: (string | null)[];
  items: (string | null)[];
  size: number[];
  isXBRL: (number | null)[];
  isInlineXBRL: (number | null)[];
  primaryDocument: string[];
  primaryDocDescription: (string | null)[];
};

type Submissions = {
  cik: string; // no leading zeros
  name: string;
  filings: {
    recent: RecentBlock;
    files?: { name: string; filingCount: number; filingFrom: string; filingTo: string }[];
  };
};

async function fetchSubmissions(cik10: string): Promise<Submissions> {
  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const r = await fetch(url, { headers: SEC_JSON_HEADERS, cache: "no-store" });
  if (!r.ok) throw new Error(`SEC submissions fetch failed (${r.status})`);
  return (await r.json()) as Submissions;
}

async function fetchHistoricFile(cik10: string, name: string): Promise<Submissions> {
  // name looks like 'CIK0000320193-2014.json'
  const url = `https://data.sec.gov/submissions/${name}`;
  const r = await fetch(url, { headers: SEC_JSON_HEADERS, cache: "no-store" });
  if (!r.ok) throw new Error(`SEC historic fetch failed (${r.status}) for ${name}`);
  return (await r.json()) as Submissions;
}

/* ------------- flatten + filter filings ------------- */

function flattenRecent(s: Submissions): RowOut[] {
  const r = s.filings.recent;
  const n = r.accessNumber.length;
  const out: RowOut[] = [];
  for (let i = 0; i < n; i++) {
    const accessionNumber = r.accessNumber[i];
    const filingDate = toISO(r.filingDate[i]);
    const reportDate = r.reportDate[i] ? toISO(r.reportDate[i] as string) : undefined;
    const form = r.form[i];
    const primaryDocument = r.primaryDocument[i];
    const primaryDocDescription = r.primaryDocDescription?.[i] || undefined;

    const urls = buildUrls(padCIK(s.cik), accessionNumber, primaryDocument);

    out.push({
      cik: padCIK(s.cik),
      companyName: s.name,
      form,
      filingDate,
      reportDate,
      accessionNumber,
      primaryDocument,
      primaryDocDescription,
      ...urls,
    });
  }
  return out;
}

function filterRows(
  rows: RowOut[],
  start: string,
  end: string,
  forms: string[],
  q: string | null
) {
  const setForms =
    forms && forms.length
      ? new Set(forms.map((f) => f.toUpperCase()))
      : null;

  return rows.filter((r) => {
    if (!inDateRange(r.filingDate, start, end)) return false;
    if (setForms && !setForms.has(r.form.toUpperCase())) return false;
    if (
      !containsFreeText(
        [r.primaryDocDescription || "", r.form, r.accessionNumber, r.companyName || ""],
        q
      )
    ) {
      return false;
    }
    return true;
  });
}

/* -------------------- handler -------------------- */

export async function GET(req: NextRequest, ctx: { params: { cik: string } }) {
  try {
    const idRaw = decodeURIComponent(ctx.params.cik || "").trim();

    // query params
    const { searchParams } = new URL(req.url);
    const start = toISO(searchParams.get("start") || "1994-01-01");
    const end = toISO(searchParams.get("end") || new Date().toISOString().slice(0, 10));
    const forms = (searchParams.get("forms") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const perPage = Math.min(200, Math.max(1, parseInt(searchParams.get("perPage") || "50", 10)));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const freeText = (searchParams.get("q") || "").trim() || null;

    if (!idRaw) {
      return NextResponse.json(
        { ok: false, error: "Missing identifier. Provide CIK, ticker, or company name." },
        { status: 400 }
      );
    }

    // resolve to CIK
    const resolved = await resolveIdentifierToCIK(idRaw);
    if (!resolved) {
      return NextResponse.json(
        { ok: false, error: "Ticker/Company not recognized. Pick from suggestions or enter a numeric CIK." },
        { status: 404 }
      );
    }
    const cik10 = resolved.cik10;

    // pull recent
    const sub = await fetchSubmissions(cik10);
    let rows = flattenRecent(sub);

    // If date range predates the earliest in 'recent', augment with historic files
    const needHistoric =
      start < (rows.at(-1)?.filingDate || "9999-12-31") || // crude check if we need more history
      (sub.filings.files && sub.filings.files.length > 0 && start < "2019-01-01");

    if (needHistoric && sub.filings.files?.length) {
      // Fetch only the historic files whose [filingTo] intersects our date range
      const tasks = sub.filings.files
        .filter((f) => {
          const from = toISO(f.filingFrom);
          const to = toISO(f.filingTo);
          // overlap test
          return !(to < start || from > end);
        })
        .map((f) => fetchHistoricFile(cik10, f.name).then(flattenRecent).catch(() => [] as RowOut[]));

      const lists = await Promise.all(tasks);
      for (const list of lists) rows.push(...list);
    }

    // de-dup (same accession may appear twice)
    const seen = new Set<string>();
    rows = rows.filter((r) => {
      const key = `${r.accessionNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // filter by forms/date/q
    rows = filterRows(rows, start, end, forms, freeText);

    // sort desc by filing date then accession
    rows.sort((a, b) => (a.filingDate < b.filingDate ? 1 : a.filingDate > b.filingDate ? -1 : a.accessionNumber < b.accessionNumber ? 1 : -1));

    const total = rows.length;

    // pagination
    const startIdx = (page - 1) * perPage;
    const pageRows = rows.slice(startIdx, startIdx + perPage);

    const payload = {
      ok: true,
      total,
      count: pageRows.length,
      data: pageRows,
      query: {
        id: idRaw,
        resolvedCIK: cik10,
        start,
        end,
        forms,
        perPage,
        page,
        freeText,
      } as QueryOut,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}