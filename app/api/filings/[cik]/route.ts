// app/api/filings/[cik]/route.ts
import { NextRequest } from "next/server";

/** ---------------------------
 *  Config & tiny in-memory cache
 *  --------------------------- */
const UA =
  process.env.SEC_USER_AGENT ||
  "herevna.io admin@herevna.io (contact: admin@herevna.io)";

type TickerBook = Record<
  string,
  { cik_str: number; ticker: string; title: string }
>;

type Row = {
  cik: string;                 // 10-digit, zero-padded
  companyName: string;         // best-effort from submissions
  form: string;
  filingDate: string;          // YYYY-MM-DD
  reportDate?: string | null;  // YYYY-MM-DD | null
  accessionNumber: string;     // 0000000000-00-000000
  primaryDocument: string;
  primaryDocDescription?: string | null;
  archiveBaseUrl: string;      // https://www.sec.gov/Archives/edgar/data/<cik_no_zeros>/<accno_no_dashes>/
  documentUrl: string;         // .../<primaryDocument>
  indexUrl: string;            // .../index.html
  downloadUrl: string;         // alias of documentUrl for convenience
};

declare global {
  // Avoid reloading on every invocation
  // eslint-disable-next-line no-var
  var __SEC_TICKERS__: { loadedAt: number; data: TickerBook } | undefined;
}

/** ---------------------------
 *  Helpers
 *  --------------------------- */
function headersJSON() {
  return {
    "User-Agent": UA,
    Accept: "application/json",
  };
}

async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: headersJSON(), cache: "no-store" });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Fetch ${r.status} ${url} :: ${txt.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

function padCIK(cik: string | number) {
  const s = String(cik).replace(/\D/g, "");
  return s.padStart(10, "0");
}
function stripLeadingZeros(s: string) {
  return s.replace(/^0+/, "") || "0";
}
function accNoNoDashes(acc: string) {
  return acc.replace(/-/g, "");
}
function toDate(v?: string | null): string | null {
  if (!v) return null;
  // Accept YYYY, YYYY-MM, YYYY-MM-DD
  if (/^\d{4}$/.test(v)) return `${v}-01-01`;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return `${v}-01`;
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)) return v;
  return null;
}
function withinRange(d: string, from?: string | null, to?: string | null) {
  if (!d) return false;
  const x = d;
  if (from && x < from) return false;
  if (to && x > to) return false;
  return true;
}

/** Load SEC’s official ticker mapping (cached for 6h) */
async function loadTickers(): Promise<TickerBook> {
  const now = Date.now();
  if (global.__SEC_TICKERS__ && now - global.__SEC_TICKERS__.loadedAt < 6 * 60 * 60 * 1000) {
    return global.__SEC_TICKERS__.data;
  }
  const data = await fetchJSON<TickerBook>("https://www.sec.gov/files/company_tickers.json");
  global.__SEC_TICKERS__ = { loadedAt: now, data };
  return data;
}

/** Optional: use a local map first if you have one (e.g. data/tickerMap.json) */
async function loadLocalMap(): Promise<TickerBook | null> {
  try {
    // If you have a local JSON like { "0": {cik_str: 320193, ticker:"AAPL", title:"Apple Inc."}, ... }
    const mod = await import("../../../data/tickerMap.json").catch(() => null as any);
    return (mod?.default || null) as TickerBook | null;
  } catch {
    return null;
  }
}

/** Resolve input (CIK/ticker/company) to a 10-digit CIK */
async function resolveToCIK(inputRaw: string): Promise<{ cik: string; title?: string } | null> {
  const input = inputRaw.trim().toUpperCase();
  if (!input) return null;

  // Numeric CIK directly?
  if (/^\d{1,10}$/.test(input)) return { cik: padCIK(input) };

  // Prefer local map if available (faster deploys without SEC fetch during warm-up)
  const local = await loadLocalMap();
  const books: TickerBook[] = [
    local || ({} as TickerBook),
    await loadTickers(),
  ];

  for (const book of books) {
    const list = Object.values(book);
    // exact ticker
    let best = list.find((x) => x.ticker.toUpperCase() === input);
    if (best) return { cik: padCIK(best.cik_str), title: best.title };
    // loose company title match
    const words = input.split(/\s+/).filter(Boolean);
    if (words.length) {
      const scored = list
        .map((x) => {
          const hay = x.title.toUpperCase();
          const score = words.reduce((s, w) => (hay.includes(w) ? s + 1 : s), 0);
          return { x, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);
      if (scored[0]) return { cik: padCIK(scored[0].x.cik_str), title: scored[0].x.title };
    }
  }

  return null;
}

/** Convert a SEC submissions JSON into rows */
function rowsFromSubmissionsChunk(
  chunk: any,
  cik10: string,
  companyName: string
): Row[] {
  const f = chunk?.filings?.recent;
  if (!f || !f.accessionNumber) return [];
  const n = f.accessionNumber.length;
  const cleanCIK = stripLeadingZeros(cik10);

  const out: Row[] = [];
  for (let i = 0; i < n; i++) {
    const form = String(f.form[i] || "");
    const filingDate = String(f.filingDate[i] || "");
    const accessionNumber = String(f.accessionNumber[i] || "");
    const primaryDocument = String(f.primaryDocument[i] || "");
    const primaryDocDescription = f.primaryDocDescription
      ? String(f.primaryDocDescription[i] || "")
      : "";

    if (!form || !filingDate || !accessionNumber || !primaryDocument) continue;

    const base = `https://www.sec.gov/Archives/edgar/data/${cleanCIK}/${accNoNoDashes(
      accessionNumber
    )}/`;

    out.push({
      cik: cik10,
      companyName,
      form,
      filingDate,
      reportDate: f.reportDate ? String(f.reportDate[i] || "") || null : null,
      accessionNumber,
      primaryDocument,
      primaryDocDescription: primaryDocDescription || null,
      archiveBaseUrl: base,
      documentUrl: base + encodeURIComponent(primaryDocument),
      indexUrl: base + "index.html",
      downloadUrl: base + encodeURIComponent(primaryDocument),
    });
  }
  return out;
}

/** Fetch recent + historic submission files and aggregate */
async function collectCompanyFilings(
  cik10: string
): Promise<{ companyName: string; rows: Row[] }> {
  const main = await fetchJSON<any>(`https://data.sec.gov/submissions/CIK${cik10}.json`);
  const companyName: string = main?.name || "Unknown Company";

  let rows = rowsFromSubmissionsChunk(main, cik10, companyName);

  const files: { name: string }[] = main?.filings?.files || [];
  if (Array.isArray(files) && files.length) {
    const sorted = [...files].sort((a, b) => (a.name < b.name ? 1 : -1)); // newest first
    for (const f of sorted) {
      const url = `https://data.sec.gov/submissions/${encodeURIComponent(f.name)}`;
      const chunk = await fetchJSON<any>(url);
      rows = rows.concat(rowsFromSubmissionsChunk(chunk, cik10, companyName));
    }
  }

  rows.sort((a, b) =>
    a.filingDate === b.filingDate
      ? b.accessionNumber.localeCompare(a.accessionNumber)
      : b.filingDate.localeCompare(a.filingDate)
  );

  return { companyName, rows };
}

/** ---------------------------
 *  GET /api/filings/[cikOrTickerOrName]
 *  Query params:
 *    forms=10-K,10-Q,8-K,3,4,5   (optional)
 *    start=YYYY or YYYY-MM or YYYY-MM-DD   (optional)
 *    end=YYYY or YYYY-MM or YYYY-MM-DD     (optional)
 *    ownerOnly=0|1   (optional, default 0; when 1 keeps only 3/4/5)
 *    page=1          (optional)
 *    pageSize=50     (optional, <=200)
 *  --------------------------- */
export async function GET(
  req: NextRequest,
  { params }: { params: { cik: string } }
) {
  try {
    const rawId = params?.cik ? decodeURIComponent(params.cik) : "";
    if (!rawId.trim()) {
      return Response.json(
        { error: "Missing identifier. Provide CIK, ticker, or company name." },
        { status: 400 }
      );
    }

    const sp = req.nextUrl.searchParams;

    // Forms filter
    const formsParam = sp.get("forms") || "";
    const formsSet =
      formsParam
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean).length > 0
        ? new Set(
            formsParam
              .split(",")
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean)
          )
        : null;

    const ownerOnly = sp.get("ownerOnly") === "1";

    // Date range
    const start = toDate(sp.get("start"));
    const end = toDate(sp.get("end"));

    // Pagination
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(sp.get("pageSize") || "50", 10) || 50));

    // Resolve to CIK
    const resolved = await resolveToCIK(rawId);
    if (!resolved) {
      return Response.json(
        {
          error:
            "Ticker/Company not recognized. Pick from suggestions or enter a numeric CIK.",
        },
        { status: 400 }
      );
    }

    const cik10 = resolved.cik;
    const { companyName, rows } = await collectCompanyFilings(cik10);

    // Filter
    const filtered = rows.filter((r) => {
      if (ownerOnly && !["3", "4", "5"].includes(r.form)) return false;
      if (formsSet && !formsSet.has(r.form.toUpperCase())) return false;
      if (start || end) {
        if (!withinRange(r.filingDate, start || undefined, end || undefined)) return false;
      }
      return true;
    });

    // Page slice
    const total = filtered.length;
    const from = (page - 1) * pageSize;
    const to = Math.min(from + pageSize, total);
    const pageRows = filtered.slice(from, to);

    return Response.json({
      ok: true,
      identifier: rawId,
      cik: cik10,
      companyName,
      count: pageRows.length,
      total,
      page,
      pageSize,
      rows: pageRows,
    });
  } catch (e: any) {
    const msg = String(e?.message || e || "Unknown error");
    return Response.json({ error: msg }, { status: 500 });
  }
}