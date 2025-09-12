// app/api/insider/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * ENV: set FMP_API_KEY in Vercel Project Settings -> Environment Variables
 * Example format (FMP): https://financialmodelingprep.com/api/v4/insider-trading?symbol=NVDA&apikey=YOUR_KEY
 */
const FMP_API_KEY = process.env.FMP_API_KEY || "";

/* ----------------------------- Types ----------------------------- */

type InsiderRow = {
  source: "fmp" | "sec";
  insider: string;                 // reporting person
  insiderTitle?: string;
  issuer: string;                  // issuer/company name
  symbol?: string;
  cik?: string;                    // 10-digit, left-padded
  filedAt?: string;                // filing date
  transDate?: string;              // transaction date
  txnType?: "A" | "D" | "—";       // acquired / disposed (or em dash)
  shares?: number;                 // amount transacted
  price?: number;                  // transaction price
  value?: number;                  // shares * price (if available)
  ownedAfter?: number;             // beneficially owned after txn
  formUrl?: string;                // direct doc (best effort)
  indexUrl?: string;               // EDGAR index page (best effort)

  // internal helpers to enable enrichment
  _accNo?: string;                 // accession number (########-##-######)
};

/* --------------------------- Small helpers --------------------------- */

function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return json({ ok: false, error: message }, { status });
}

function asNum(x: any): number | undefined {
  if (x === null || x === undefined || x === "") return undefined;
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}
function cleanStr(s?: string | null) {
  return (s ?? "").toString().trim() || undefined;
}
function padCIK(cik?: string | number) {
  if (!cik) return undefined;
  return String(cik).padStart(10, "0");
}

function buildSecUrls(cik?: string, accNoRaw?: string) {
  const pad = padCIK(cik);
  const accNo = accNoRaw?.replace(/-/g, "");
  if (!pad || !accNo) return {};
  const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(pad, 10)}/${accNo}`;
  return {
    indexUrl: `${base}/index.json`,
    formUrl: `${base}/index.html`, // often resolves; we try to replace with XML later
  };
}

/* ---------------------- SEC Form 4 XML parse helpers ---------------------- */

/** Extracts the first match group for a simple XML tag, returns undefined if missing */
function tag(text: string, name: string): string | undefined {
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i");
  const m = text.match(re);
  return m?.[1]?.trim();
}

/** Pull first <nonDerivativeTransaction> block to get main txn values */
function firstTxnBlock(xml: string): string | undefined {
  const re = /<nonDerivativeTransaction\b[^>]*>[\s\S]*?<\/nonDerivativeTransaction>/i;
  const m = xml.match(re);
  return m?.[0];
}

/** Try to pick the “best” XML path from EDGAR index.json */
function selectXmlFromIndex(idx: any): string | undefined {
  const items: any[] = idx?.directory?.item || [];
  if (!Array.isArray(items) || items.length === 0) return undefined;

  // Prefer ownership XMLs
  const ownership = items.find((i) =>
    /ownership|form4|xml/i.test(String(i?.name || "")) && /\.xml$/i.test(String(i?.name || ""))
  );
  if (ownership) return String(ownership?.name);

  // Next: any XML
  const anyXml = items.find((i) => /\.xml$/i.test(String(i?.name || "")));
  if (anyXml) return String(anyXml?.name);

  // Otherwise: first HTM as fallback
  const htm = items.find((i) => /\.(htm|html)$/i.test(String(i?.name || "")));
  if (htm) return String(htm?.name);

  return undefined;
}

/** SEC enrichment: fetch index.json and XML, parse A/D, shares, price, ownedAfter, dates, and build URLs */
async function enrichFromSEC(cik?: string, accNoRaw?: string): Promise<Partial<InsiderRow> | null> {
  const pad = padCIK(cik);
  const accNo = accNoRaw?.replace(/-/g, "");
  if (!pad || !accNo) return null;

  const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(pad, 10)}/${accNo}`;
  const indexUrl = `${base}/index.json`;

  const idxResp = await fetch(indexUrl, {
    headers: {
      "User-Agent": "Herevna/1.0 (+https://herevna.io)",
      "Accept": "application/json",
    },
    cache: "no-store",
  });

  if (!idxResp.ok) {
    return {
      indexUrl,
      formUrl: `${base}/index.html`,
    };
  }

  const idx = await idxResp.json();
  const xmlName = selectXmlFromIndex(idx);
  const xmlUrl = xmlName ? `${base}/${xmlName}` : undefined;

  if (!xmlUrl) {
    return {
      indexUrl,
      formUrl: `${base}/index.html`,
    };
  }

  const xmlResp = await fetch(xmlUrl, {
    headers: { "User-Agent": "Herevna/1.0 (+https://herevna.io)" },
    cache: "no-store",
  });
  if (!xmlResp.ok) {
    return {
      indexUrl,
      formUrl: `${base}/index.html`,
    };
  }

  const xml = await xmlResp.text();

  // Try periodOfReport for filed/txn date
  const filedAt = tag(xml, "periodOfReport") || undefined;

  // Pull first nonDerivativeTransaction
  const block = firstTxnBlock(xml) ?? xml;

  // A/D code
  const txnCodeFromXml =
    tag(block, "transactionAcquiredDisposedCode") ||
    tag(block, "transactionAcquiredDisposed") ||
    undefined;

  let txnType: "A" | "D" | "—" | undefined;
  const codeUp = (txnCodeFromXml || "").toUpperCase();
  if (codeUp.startsWith("A")) txnType = "A";
  else if (codeUp.startsWith("D")) txnType = "D";
  else txnType = "—";

  // Shares and price
  const shares =
    asNum(tag(block, "transactionShares")) ??
    asNum(tag(block, "transactionShareAmount")) ??
    asNum(tag(block, "transactionAmount"));

  const price =
    asNum(tag(block, "transactionPricePerShare")) ??
    asNum(tag(block, "pricePerShare")) ??
    asNum(tag(block, "transactionPrice"));

  // Owned after
  const ownedAfter =
    asNum(tag(block, "sharesOwnedFollowingTransaction")) ??
    asNum(tag(xml, "sharesOwnedFollowingTransaction"));

  // Transaction date (usually <transactionDate><value>YYYY-MM-DD</value></transactionDate>)
  const txnDate =
    tag(block, "transactionDate") ||
    tag(xml, "transactionDate") ||
    undefined;

  return {
    indexUrl,
    formUrl: xmlUrl, // direct XML (usually best for evidence)
    filedAt,
    transDate: txnDate,
    txnType,
    shares,
    price,
    ownedAfter,
  };
}

/* ---------------------------- FMP primary ---------------------------- */

function normalizeTxnType(raw: any): "A" | "D" | undefined {
  const s = (raw ?? "").toString().toUpperCase();
  // Map common FMP fields / words
  if (/\bA\b/.test(s) || /ACQ|PURCH|BUY/.test(s)) return "A";
  if (/\bD\b/.test(s) || /DISP|SALE|SELL/.test(s)) return "D";
  // sometimes FMP uses letter codes like "A", "D", or "M", "S" etc.
  if (s.startsWith("A")) return "A";
  if (s.startsWith("D")) return "D";
  return undefined;
}

async function fetchFromFMP(params: {
  symbol?: string;
  start?: string;
  end?: string;
  txnType?: "ALL" | "A" | "D";
  page?: number;
  perPage?: number;
}) {
  if (!FMP_API_KEY) return { rows: [] as InsiderRow[], meta: { source: "fmp", note: "missing FMP key" } };

  const { symbol, start, end, txnType = "ALL", page = 1, perPage = 50 } = params;

  const url = new URL("https://financialmodelingprep.com/api/v4/insider-trading");
  if (symbol) url.searchParams.set("symbol", symbol.toUpperCase());
  if (start) url.searchParams.set("from", start);
  if (end) url.searchParams.set("to", end);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(perPage));
  url.searchParams.set("apikey", FMP_API_KEY);

  const r = await fetch(url.toString(), {
    headers: { "User-Agent": "Herevna/1.0 (Insider Screener)" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`FMP failed ${r.status}`);

  const arr = await r.json();
  if (!Array.isArray(arr)) return { rows: [] as InsiderRow[], meta: { source: "fmp", count: 0 } };

  // Filter by A/D if requested
  let filtered = arr as any[];
  if (txnType !== "ALL") {
    filtered = filtered.filter((t) => {
      const raw =
        t.transactionCode ??
        t.acquisitionOrDisposition ??
        t.transactionType ??
        t.type ??
        t.ad ??
        "";
      const norm = normalizeTxnType(raw);
      return txnType === "A" ? norm === "A" : norm === "D";
    });
  }

  const rows: InsiderRow[] = filtered.map((t) => {
    const cikRaw = t.cik || t.issuerCik || t.cikIssuer || t.cikNumber;
    const accRaw = t.accNo || t.accessionNumber || t.accession || t.accessionNumberLatest;
    const { formUrl, indexUrl } = buildSecUrls(cikRaw, accRaw);

    const shares =
      asNum(t.shares) ??
      asNum(t.securitiesTransacted) ??
      asNum(t.amountOfSecuritiesTransacted);

    const price =
      asNum(t.price) ??
      asNum(t.transactionPrice) ??
      asNum(t.transactionPricePerShare);

    const ownedAfter =
      asNum(t.sharesOwnedFollowingTransaction) ??
      asNum(t.securitiesOwnedFollowingTransaction);

    const txnTypeNorm = normalizeTxnType(
      t.transactionCode ??
        t.acquisitionOrDisposition ??
        t.transactionType ??
        t.type ??
        t.ad
    );

    const val = shares && price ? shares * price : undefined;

    return {
      source: "fmp",
      insider: cleanStr(t.insiderName) || cleanStr(t.reportingName) || "—",
      insiderTitle: cleanStr(t.insiderTitle) || cleanStr(t.reportingTitle),
      issuer:
        cleanStr(t.companyName) ||
        cleanStr(t.issuerName) ||
        cleanStr(t.issuer) ||
        "—",
      symbol: cleanStr(t.ticker) || cleanStr(t.symbol),
      cik: cikRaw ? padCIK(cikRaw) : undefined,
      filedAt: cleanStr(t.filingDate) || cleanStr(t.acceptedDate),
      transDate: cleanStr(t.transactionDate) || cleanStr(t.transactionDate2) || cleanStr(t.date),
      txnType: txnTypeNorm ?? "—",
      shares,
      price,
      value: val,
      ownedAfter,
      formUrl: cleanStr(t.link) || formUrl,
      indexUrl,
      _accNo: cleanStr(accRaw),
    };
  });

  return {
    rows,
    meta: { source: "fmp", count: rows.length, page, perPage },
  };
}

/* ------------------------------ SEC fallback ------------------------------ */

async function secFallbackPointer(symbol?: string) {
  if (!symbol) return { rows: [] as InsiderRow[], meta: { source: "sec", note: "no symbol" } };

  const q = encodeURIComponent(`${symbol} form 4`);
  const url = `https://www.sec.gov/edgar/search/#/category=custom&forms=4&q=${q}`;

  const row: InsiderRow = {
    source: "sec",
    insider: "—",
    issuer: "—",
    symbol,
    txnType: "—",
    formUrl: url,
    indexUrl: url,
  };

  return { rows: [row], meta: { source: "sec", note: "search pointer" } };
}

/* --------------------------------- GET --------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = cleanStr(searchParams.get("symbol") || "");
    const start = cleanStr(searchParams.get("start") || "");
    const end = cleanStr(searchParams.get("end") || "");
    const txnTypeRaw = (searchParams.get("txnType") || "ALL").toUpperCase();
    const txnType = (["A", "D"].includes(txnTypeRaw) ? txnTypeRaw : "ALL") as "ALL" | "A" | "D";
    const page = Number(searchParams.get("page") || "1") || 1;
    const perPage = Math.min(200, Number(searchParams.get("perPage") || "50") || 50);

    // 1) FMP primary
    const fmp = await fetchFromFMP({ symbol, start, end, txnType, page, perPage });
    let rows = fmp.rows;

    // 2) Enrich each FMP row with SEC XML if we have CIK + accession
    //    (limit concurrent calls to be polite; simple window of 8)
    const window = 8;
    const enriched: InsiderRow[] = [];
    for (let i = 0; i < rows.length; i += window) {
      const batch = rows.slice(i, i + window).map(async (r) => {
        if (!r.cik || !r._accNo) return r;
        try {
          const extra = await enrichFromSEC(r.cik, r._accNo);
          if (!extra) return r;
          const merged: InsiderRow = {
            ...r,
            // Prefer explicit SEC links when available
            formUrl: extra.formUrl || r.formUrl,
            indexUrl: extra.indexUrl || r.indexUrl,
            // Ensure A/D always present
            txnType: r.txnType && r.txnType !== "—" ? r.txnType : (extra.txnType as "A" | "D" | "—"),
            shares: r.shares ?? extra.shares,
            price: r.price ?? extra.price,
            ownedAfter: r.ownedAfter ?? extra.ownedAfter,
            filedAt: r.filedAt || extra.filedAt,
            transDate: r.transDate || extra.transDate,
          };
          merged.value =
            typeof merged.value === "number"
              ? merged.value
              : typeof merged.shares === "number" && typeof merged.price === "number"
              ? merged.shares * merged.price
              : undefined;
          return merged;
        } catch {
          return r; // keep original row if SEC call fails
        }
      });
      const got = await Promise.all(batch);
      enriched.push(...got);
    }
    rows = enriched;

    if (rows.length > 0) {
      return json({ ok: true, rows, meta: fmp.meta });
    }

    // 3) SEC pointer fallback if FMP returned nothing
    const sec = await secFallbackPointer(symbol);
    return json({ ok: true, rows: sec.rows, meta: sec.meta });
  } catch (e: any) {
    return err(e?.message || "Unexpected error", 500);
  }
}