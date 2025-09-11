// app/api/insider/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = "nodejs"; // we need Node for string/XML parsing

import { NextRequest, NextResponse } from "next/server";

// ---------- small helpers ----------
function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return json({ error: message }, { status });
}

const SEC_UA =
  process.env.SEC_USER_AGENT ||
  "herevna.ai/1.0 (admin@herevna.io; +https://herevna.io)";

/** Fetch JSON from SEC with required headers + no-store caching */
async function fetchJSON<T = any>(url: string): Promise<T> {
  const r = await fetch(url, {
    headers: {
      "user-agent": SEC_UA,
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  return (await r.json()) as T;
}

/** Fetch text (for XML/HTML) from SEC with required headers */
async function fetchTEXT(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      "user-agent": SEC_UA,
      accept: "text/plain, text/xml, application/xml, */*",
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  return await r.text();
}

/** Parse YYYY-MM-DD from string; returns null if invalid */
function asDate(s?: string | null): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Strip leading zeros from a CIK for /Archives path */
function cikNoLeadingZeros(cik: string) {
  return String(parseInt(cik, 10));
}

/** Remove dashes from an accession number for /Archives dir */
function accessionNoDashes(acc: string) {
  return acc.replace(/-/g, "");
}

/** Extract all occurrences of <tag>...</tag> from xml string */
function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

/** Extract first <tag>value</tag> as string (or undefined) */
function extractOne(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : undefined;
}

/** Resolve stock symbol -> CIK + company name via SEC map */
async function getCikFromSymbol(
  rawSymbol: string
): Promise<{ cik: string; name: string } | null> {
  const symbol = (rawSymbol || "").trim().toUpperCase();
  if (!symbol) return null;

  const url = "https://www.sec.gov/files/company_tickers.json";
  type SecTickerRow = { cik: number; ticker: string; title: string };
  const data = (await fetchJSON<Record<string, SecTickerRow>>(url)) || {};

  const hit: SecTickerRow | undefined = Object.values(data).find(
    (r) => r?.ticker?.toUpperCase() === symbol
  );
  if (!hit) return null;

  return {
    cik: String(hit.cik).padStart(10, "0"),
    name: hit.title,
  };
}

/** Pull recent Form 4 filings for a CIK from SEC submissions JSON */
async function getRecentForm4ForCik(cik: string) {
  const padded = cik.padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;

  const sub = await fetchJSON<any>(url);
  const recent = sub?.filings?.recent;
  if (!recent) return [];

  // Build arrays aligned by index
  const forms: string[] = recent.form || [];
  const accs: string[] = recent.accessionNumber || [];
  const reportDates: string[] = recent.reportDate || [];
  const fileDates: string[] = recent.filingDate || [];
  const primaryDocs: string[] = recent.primaryDocument || [];
  const symbols: string[] = recent.ticker || []; // sometimes present

  const out: {
    form: string;
    accessionNumber: string;
    reportDate?: string;
    filingDate: string;
    primaryDoc?: string;
    symbol?: string;
  }[] = [];

  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === "4") {
      out.push({
        form: forms[i],
        accessionNumber: accs[i],
        reportDate: reportDates[i],
        filingDate: fileDates[i],
        primaryDoc: primaryDocs[i],
        symbol: symbols[i],
      });
    }
  }
  return out;
}

/** Given a filing (Form 4), download & parse the XML for Table 1 (non-derivative transactions) */
async function parseForm4Details(params: {
  cik: string;
  accessionNumber: string;
  primaryDoc?: string;
}) {
  const { cik, accessionNumber, primaryDoc } = params;
  // Construct archive path
  const cikNo0 = cikNoLeadingZeros(cik);
  const accDir = accessionNoDashes(accessionNumber);

  // If primaryDoc ends with .xml we can use it; otherwise try standard form4.xml
  const candidates = [
    primaryDoc,
    "form4.xml",
    "primary_doc.xml",
    "ownership.xml",
  ].filter(Boolean) as string[];

  let xmlText: string | null = null;
  let used: string | undefined;

  for (const cand of candidates) {
    const url = `https://www.sec.gov/Archives/edgar/data/${cikNo0}/${accDir}/${cand}`;
    try {
      const t = await fetchTEXT(url);
      if (t && t.includes("<ownershipDocument")) {
        xmlText = t;
        used = cand;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  if (!xmlText) {
    // last resort: index to find xml name
    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNo0}/${accDir}/index.json`;
    try {
      const idx = await fetchJSON<{ directory: { item: { name: string }[] } }>(
        indexUrl
      );
      const guess = idx?.directory?.item?.find((it) =>
        it.name.toLowerCase().endsWith(".xml")
      );
      if (guess) {
        const alt = `https://www.sec.gov/Archives/edgar/data/${cikNo0}/${accDir}/${guess.name}`;
        const t = await fetchTEXT(alt);
        if (t && t.includes("<ownershipDocument")) {
          xmlText = t;
          used = guess.name;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!xmlText) return null;

  // Parse issuer + reporting owner
  const issuerName =
    extractOne(xmlText, "issuerName") || extractOne(xmlText, "issuerNameText");
  const issuerTradingSymbol =
    extractOne(xmlText, "issuerTradingSymbol") ||
    extractOne(xmlText, "issuerSymbol");

  const reportingOwners = extractAll(xmlText, "reportingOwner");
  const firstOwner = reportingOwners[0] || "";
  const insiderName =
    extractOne(firstOwner, "rptOwnerName") ||
    extractOne(firstOwner, "reportingOwnerName") ||
    "—";

  // Table 1 non-derivative transactions (can be multiple)
  const txBlocks = extractAll(xmlText, "nonDerivativeTransaction");

  type TxRow = {
    action: "A" | "D" | "—";
    shares?: number;
    price?: number;
    ownedFollowing?: number;
  };

  const rows: TxRow[] = txBlocks.map((blk) => {
    const shares =
      extractOne(blk, "transactionShares") ||
      extractOne(blk, "transactionAmounts") ||
      undefined;

    const sharesVal = Number(
      extractOne(blk, "value") ||
        extractOne(blk, "transactionShares") ||
        "NaN"
    );

    const ad =
      extractOne(blk, "transactionAcquiredDisposedCode") ||
      extractOne(blk, "transactionAcquiredDisposed") ||
      extractOne(blk, "transactionCode") ||
      "—";
    const action = (ad.match(/[AD]/i)?.[0]?.toUpperCase() as "A" | "D") || "—";

    const priceVal = Number(
      extractOne(blk, "transactionPricePerShare") ||
        extractOne(blk, "pricePerShare") ||
        "NaN"
    );

    const ownedFollowingVal = Number(
      extractOne(blk, "sharesOwnedFollowingTransaction") ||
        extractOne(blk, "postTransactionAmounts") ||
        "NaN"
    );

    return {
      action,
      shares: Number.isFinite(sharesVal) ? sharesVal : undefined,
      price: Number.isFinite(priceVal) ? priceVal : undefined,
      ownedFollowing: Number.isFinite(ownedFollowingVal)
        ? ownedFollowingVal
        : undefined,
    };
  });

  const archiveBase = `https://www.sec.gov/Archives/edgar/data/${cikNo0}/${accDir}`;
  return {
    issuer: issuerName || "—",
    symbol: issuerTradingSymbol || undefined,
    insider: insiderName || "—",
    formUrl: `${archiveBase}/${used || "form4.xml"}`,
    indexUrl: `${archiveBase}/index.html`,
    transactions: rows,
  };
}

// ---------- API Route ----------
/**
 * GET /api/insider?symbol=NVDA
 * GET /api/insider?cik=0000320193
 * GET /api/insider?issuer=Apple
 *
 * Optional:
 *   start=YYYY-MM-DD
 *   end=YYYY-MM-DD
 *   action=A|D|ALL  (default ALL)
 *   page=1 (1-based)
 *   perPage=25
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const symbol = searchParams.get("symbol") || "";
    const cik = searchParams.get("cik") || "";
    const issuerQuery = searchParams.get("issuer") || "";

    const startStr = searchParams.get("start") || "";
    const endStr = searchParams.get("end") || "";
    const actionRaw = (searchParams.get("action") || "ALL").toUpperCase();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("perPage") || "25", 10))
    );

    if (!symbol && !cik && !issuerQuery) {
      return err("Provide symbol, cik, or issuer.");
    }

    let resolvedCik = cik.trim();
    let resolvedIssuer = issuerQuery.trim();

    // If symbol given → resolve to CIK
    if (symbol && !resolvedCik) {
      const hit = await getCikFromSymbol(symbol);
      if (!hit) return err("Could not resolve symbol to CIK", 404);
      resolvedCik = hit.cik;
      if (!resolvedIssuer) resolvedIssuer = hit.name;
    }

    // If only issuer name given (no symbol/cik) → naive lookup via SEC ticker map title match
    if (!symbol && !resolvedCik && resolvedIssuer) {
      try {
        const url = "https://www.sec.gov/files/company_tickers.json";
        type Row = { cik: number; ticker: string; title: string };
        const data = await fetchJSON<Record<string, Row>>(url);
        const hit = Object.values(data).find((r) =>
          r?.title?.toLowerCase().includes(resolvedIssuer.toLowerCase())
        );
        if (hit) {
          resolvedCik = String(hit.cik).padStart(10, "0");
        }
      } catch {
        // ignore; we’ll proceed without CIK (will fail below if necessary)
      }
    }

    if (!resolvedCik) {
      return err("Unable to resolve a CIK from your query.", 404);
    }

    // Pull recent Form 4 filings for this CIK
    const filings = await getRecentForm4ForCik(resolvedCik);

    // Date filtering (use filingDate)
    const startDate = asDate(startStr);
    const endDate = asDate(endStr);
    const filteredByDate = filings.filter((f) => {
      const d = asDate(f.filingDate);
      if (!d) return false;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });

    // Pagination first, then we’ll fetch/parse details for the current page
    const total = filteredByDate.length;
    const offset = (page - 1) * perPage;
    const pageSlice = filteredByDate.slice(offset, offset + perPage);

    // Fetch + parse XML for each page item
    const details = await Promise.all(
      pageSlice.map((f) =>
        parseForm4Details({
          cik: resolvedCik,
          accessionNumber: f.accessionNumber,
          primaryDoc: f.primaryDoc,
        }).catch(() => null)
      )
    );

    // Flatten out transactions and apply A/D filter
    const actionMode: "ALL" | "A" | "D" =
      actionRaw === "A" || actionRaw === "D" ? (actionRaw as any) : "ALL";

    type Row = {
      insider: string;
      issuer: string;
      symbol?: string;
      filedAt: string;
      action: "A" | "D" | "—";
      shares?: number;
      price?: number;
      value?: number;
      ownedFollowing?: number; // Beneficially Owned Shares after tx
      formUrl: string;
      indexUrl: string;
      accessionNumber: string;
    };

    const rows: Row[] = [];
    for (let i = 0; i < pageSlice.length; i++) {
      const f = pageSlice[i];
      const d = details[i];
      if (!d) continue;

      const filedAt = f.filingDate || f.reportDate || "—";
      const issuer = d.issuer || "—";
      const symbolFromXml = d.symbol || f.symbol;
      const insider = d.insider || "—";

      // If no transactions table, at least push one row with links
      if (!d.transactions || d.transactions.length === 0) {
        rows.push({
          insider,
          issuer,
          symbol: symbolFromXml,
          filedAt,
          action: "—",
          formUrl: d.formUrl,
          indexUrl: d.indexUrl,
          accessionNumber: f.accessionNumber,
        });
        continue;
      }

      for (const tx of d.transactions) {
        if (actionMode !== "ALL" && tx.action !== actionMode) continue;
        const value =
          typeof tx.shares === "number" && typeof tx.price === "number"
            ? tx.shares * tx.price
            : undefined;

        rows.push({
          insider,
          issuer,
          symbol: symbolFromXml,
          filedAt,
          action: tx.action,
          shares: tx.shares,
          price: tx.price,
          value,
          ownedFollowing: tx.ownedFollowing,
          formUrl: d.formUrl,
          indexUrl: d.indexUrl,
          accessionNumber: f.accessionNumber,
        });
      }
    }

    return json({
      ok: true,
      query: {
        symbol: symbol || null,
        cik: resolvedCik,
        issuer: resolvedIssuer || null,
        start: startStr || null,
        end: endStr || null,
        action: actionMode,
        page,
        perPage,
      },
      total,
      count: rows.length,
      data: rows,
    });
  } catch (e: any) {
    return err(e?.message || "Unexpected server error", 500);
  }
}