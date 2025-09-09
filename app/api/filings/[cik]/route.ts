// app/api/filings/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * SEC Search API (powers deep history + filters):
 *   POST https://efts.sec.gov/LATEST/search-index
 * Docs are light; this mirrors what the web UI does.
 *
 * We also resolve non-numeric identifiers (tickers/company names)
 * to a CIK via the official SEC ticker list:
 *   https://www.sec.gov/files/company_tickers.json
 */

const SEC_UA =
  process.env.SEC_USER_AGENT ||
  "Herevna.io admin@herevna.io (EDGAR filings)";

const SEARCH_URL = "https://efts.sec.gov/LATEST/search-index";
const TICKER_LIST_URL = "https://www.sec.gov/files/company_tickers.json";

// Helpful default forms (expandable)
const DEFAULT_FORMS = [
  "10-K",
  "10-Q",
  "8-K",
  "S-1",
  "S-3",
  "S-4",
  "20-F",
  "40-F",
  "6-K",
  "11-K",
  "13F-HR",
  "13D",
  "SC 13D",
  "SC 13D/A",
  "13G",
  "SC 13G",
  "SC 13G/A",
  "3",
  "4",
  "5",
  "DEF 14A",
  "DEFA14A",
  "PX14A6G",
  "424B2",
  "424B3",
  "424B4",
  "424B5",
  "424B7",
  "424B8",
] as const;

type SearchBody = {
  keys?: string;           // free-text keys (ticker, company, CIK)
  ciks?: string[];         // array of 10-digit CIKs (string)
  formTypes?: string[];    // list of forms to include
  startdt?: string;        // YYYY-MM-DD
  enddt?: string;          // YYYY-MM-DD
  from?: number;           // offset (pagination)
  size?: number;           // page size 1..200
  category?: string;       // optional; UI uses "custom"
};

type Hit = {
  // This shape is simplified; the API returns more fields
  cik: number;
  adsh: string;            // accession with dashes (e.g. 0001193125-24-095399)
  filed: string;           // YYYY-MM-DD
  form: string;            // e.g., "10-K"
  primaryDoc?: string;     // often present; sometimes "primaryDocument" in other feeds
  display_names?: string;  // company name
};

type SearchResponse = {
  hits: {
    hits: { _source: Hit }[];
    total?: number;
  };
};

/** Pad numeric CIK to 10 chars (string) */
function padCIK(n: string | number) {
  const s = String(n).replace(/\D/g, "");
  return s.padStart(10, "0");
}

/** Remove leading zeros from CIK for archive paths */
function cikNoZeros(cik10: string) {
  return String(parseInt(cik10, 10));
}

/** Strip dashes from accession for archive dir */
function accessionNoDash(adsh: string) {
  return adsh.replace(/-/g, "");
}

/** Build canonical SEC document links (index + dir + primary if known) */
function buildDocLinks(cik10: string, adsh: string, primaryDoc?: string) {
  const cikPath = cikNoZeros(cik10);
  const adshNoDash = accessionNoDash(adsh);
  const baseDir = `https://www.sec.gov/Archives/edgar/data/${cikPath}/${adshNoDash}`;
  // Index page for the filing:
  const indexHtml = `${baseDir}/${adsh}-index.htm`;
  // Primary document (if the API provided a filename); falls back to just the dir
  const primary =
    primaryDoc && /^[\w.\-]+$/.test(primaryDoc) ? `${baseDir}/${primaryDoc}` : baseDir;
  return { indexHtml, dir: baseDir, primary };
}

/** Fetch the official SEC ticker list and resolve to CIK */
async function resolveToCIK(idOrQuery: string): Promise<{ cik10: string; name?: string } | null> {
  // If it's already a CIK-like string, accept it.
  if (/^\d{1,10}$/.test(idOrQuery.trim())) {
    return { cik10: padCIK(idOrQuery.trim()) };
  }

  // Try the SEC ticker JSON (small enough to fetch and cache at edge)
  const res = await fetch(TICKER_LIST_URL, {
    headers: { "User-Agent": SEC_UA, "Accept": "application/json" },
    next: { revalidate: 60 * 60 }, // revalidate hourly
  });
  if (!res.ok) return null;

  // Format: { "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }, ... }
  const listing: Record<string, { cik_str: number; ticker: string; title: string }> =
    await res.json();

  const q = idOrQuery.trim().toUpperCase();

  // 1) Exact/near-exact ticker
  for (const k of Object.keys(listing)) {
    const row = listing[k];
    if (row.ticker.toUpperCase() === q) {
      return { cik10: padCIK(row.cik_str), name: row.title };
    }
  }

  // 2) Company name contains query (simple contains to be forgiving)
  for (const k of Object.keys(listing)) {
    const row = listing[k];
    if (row.title.toUpperCase().includes(q)) {
      return { cik10: padCIK(row.cik_str), name: row.title };
    }
  }

  return null;
}

function parseFormsParam(raw?: string | null): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  // Normalize some common aliases
  return parts.map(f => f.toUpperCase());
}

/** GET /api/filings/[id]?start=YYYY-MM-DD&end=YYYY-MM-DD&forms=10-K,8-K&perPage=50&page=1&q=free+text
 *  id can be: CIK (numeric), ticker (NVDA), or a company name fragment.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);

    const rawId = decodeURIComponent(params.id || "").trim();
    if (!rawId) {
      return NextResponse.json(
        { error: "Missing identifier. Provide CIK, ticker, or company name." },
        { status: 400 }
      );
    }

    const start = searchParams.get("start") || "2000-01-01";
    const end = searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const forms = parseFormsParam(searchParams.get("forms")) || [...DEFAULT_FORMS];
    const perPage = Math.min(Math.max(parseInt(searchParams.get("perPage") || "50"), 1), 200);
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const freeText = searchParams.get("q")?.trim() || "";

    // Resolve identifier to a CIK when possible, but keep a fallback:
    const resolved = await resolveToCIK(rawId);
    const cik10 = resolved?.cik10; // may be undefined if nothing matched

    // Build query body for SEC search-index
    const body: SearchBody = {
      category: "custom",
      formTypes: forms,
      startdt: start,
      enddt: end,
      size: perPage,
      from: (page - 1) * perPage,
    };

    // Prefer exact CIK if we have it; otherwise send keys as user input
    if (cik10) {
      body.ciks = [cik10];
      // also add keys for a bit more recall matching (SEC seems to like keys)
      body.keys = cik10;
    } else {
      // Use the raw id (ticker / company name) and any free text
      body.keys = [rawId, freeText].filter(Boolean).join(" ");
    }

    const resp = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": SEC_UA,
        // (Optional but harmless)
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Origin": "https://www.sec.gov",
        "Referer": "https://www.sec.gov/edgar/search/",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: `SEC search failed (${resp.status})`, details: text.slice(0, 300) },
        { status: 502 }
      );
    }

    const json = (await resp.json()) as SearchResponse;

    const hits = json?.hits?.hits || [];
    const total = json?.hits?.total ?? hits.length;

    const rows = hits.map((h) => {
      const s = h._source as Hit;
      const cik10Local = padCIK(s.cik);
      const links = buildDocLinks(cik10Local, s.adsh, (s as any).primaryDoc);
      return {
        cik: cik10Local,
        company: s.display_names || undefined,
        form: s.form,
        filed: s.filed,
        accessionNumber: s.adsh,
        links,              // { indexHtml, dir, primary }
        download: links.indexHtml, // convenience alias for UI "Download / View"
      };
    });

    return NextResponse.json({
      ok: true,
      query: {
        id: rawId,
        resolvedCIK: cik10 || null,
        start,
        end,
        forms,
        perPage,
        page,
        freeText: freeText || null,
      },
      total,
      count: rows.length,
      data: rows,
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}