// app/api/insider/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_API_KEY = process.env.FMP_API_KEY || "";

// ---------- Types ----------
type InsiderRow = {
  source: "fmp" | "sec";
  insider: string;                 // reporting person
  insiderTitle?: string;
  issuer: string;                  // issuer/company name
  symbol?: string;
  cik?: string;
  filedAt?: string;                // filing date
  transDate?: string;              // transaction date
  txnType?: "A" | "D";             // acquired / disposed
  shares?: number;                 // amount transacted
  price?: number;                  // transaction price
  value?: number;                  // shares * price (if available)
  ownedAfter?: number;             // beneficially owned after txn
  formUrl?: string;                // direct doc (e.g., XML) when possible
  indexUrl?: string;               // index.html (safe fallback)
  _accNo?: string;                 // internal: accession number (normalized)
};

// ---------- Small helpers ----------
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
function cikForUrl(cik?: string | number) {
  if (!cik) return undefined;
  // SEC Archives path uses CIK WITHOUT leading zeros
  return String(parseInt(String(cik), 10));
}
function normalizeAcc(acc?: string) {
  return (acc || "").replace(/-/g, "");
}
function buildSecUrls(cik?: string | number, accNoRaw?: string) {
  const cikPath = cikForUrl(cik);
  const acc = normalizeAcc(accNoRaw);
  if (!cikPath || !acc) return {};
  const base = `https://www.sec.gov/Archives/edgar/data/${cikPath}/${acc}`;
  return {
    indexUrl: `${base}/index.html`,
    formUrl: `${base}/index.html`, // will try to replace with XML after index.json fetch
  };
}

// ---------- SEC enrichment (best-effort) ----------
async function enrichFromSEC(cik?: string | number, accNoRaw?: string) {
  try {
    const cikPath = cikForUrl(cik);
    const acc = normalizeAcc(accNoRaw);
    if (!cikPath || !acc) return null;

    const base = `https://www.sec.gov/Archives/edgar/data/${cikPath}/${acc}`;
    const idxRes = await fetch(`${base}/index.json`, {
      headers: { "User-Agent": "Herevna/1.0 (Insider Screener)" },
      cache: "no-store",
    });
    if (!idxRes.ok) {
      return { indexUrl: `${base}/index.html`, formUrl: `${base}/index.html` };
    }
    const idx = await idxRes.json();
    const items: any[] = idx?.directory?.item || [];

    // Prefer an XML (primary doc)
    const xmlItem = items.find((it) => /\.xml$/i.test(it.name));
    const formUrl = xmlItem ? `${base}/${xmlItem.name}` : `${base}/index.html`;

    if (!xmlItem) {
      return { indexUrl: `${base}/index.html`, formUrl };
    }

    const xr = await fetch(formUrl, {
      headers: { "User-Agent": "Herevna/1.0 (Insider Screener)" },
      cache: "no-store",
    });
    if (!xr.ok) {
      return { indexUrl: `${base}/index.html`, formUrl: `${base}/index.html` };
    }
    const xml = await xr.text();

    // Extract FIRST nonDerivativeTransaction block
    const firstTxn =
      xml.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/i)?.[0] || "";
    const getVal = (tag: string) =>
      firstTxn.match(new RegExp(`<${tag}>\\s*<value>([\\s\\S]*?)<\\/value>\\s*<\\/${tag}>`, "i"))?.[1]?.trim();

    const ad = getVal("transactionAcquiredDisposedCode"); // "A" | "D"
    const shares = Number(getVal("transactionShares") || "");
    const price = Number(getVal("transactionPricePerShare") || "");
    const ownedAfter = Number(getVal("sharesOwnedFollowingTransaction") || "");
    const transDate = getVal("transactionDate");

    const filedAt =
      xml.match(/<periodOfReport>(.*?)<\/periodOfReport>/i)?.[1]?.trim() ||
      xml.match(/<documentPeriodEndDate>(.*?)<\/documentPeriodEndDate>/i)?.[1]?.trim();

    return {
      indexUrl: `${base}/index.html`,
      formUrl,
      txnType: ad === "A" || ad === "D" ? (ad as "A" | "D") : undefined,
      shares: Number.isFinite(shares) ? shares : undefined,
      price: Number.isFinite(price) ? price : undefined,
      ownedAfter: Number.isFinite(ownedAfter) ? ownedAfter : undefined,
      filedAt: filedAt || undefined,
      transDate: transDate || undefined,
    };
  } catch {
    return null;
  }
}

// ---------- FMP primary ----------
async function fetchFromFMP(params: {
  symbol?: string;
  start?: string;
  end?: string;
  txnType?: "ALL" | "A" | "D";
  page?: number;
  perPage?: number;
}) {
  const { symbol, start, end, txnType = "ALL", page = 1, perPage = 50 } = params;

  if (!FMP_API_KEY) {
    return { rows: [], meta: { source: "fmp", note: "missing FMP key" } };
  }

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
  if (!Array.isArray(arr)) return { rows: [], meta: { source: "fmp", count: 0 } };

  // Type filter (A/D) if requested
  let filtered = arr as any[];
  if (txnType !== "ALL") {
    filtered = filtered.filter((t) => {
      const acqDisp =
        t.acquisitionOrDisposition ||
        t.transactionType ||
        t.type ||
        t.ad ||
        t.transactionCode ||
        "";
      const code = (acqDisp || "").toString().toUpperCase();
      if (txnType === "A") return code.startsWith("A") || /PURCHASE|ACQ/.test(code);
      if (txnType === "D") return code.startsWith("D") || /SALE|DISP/.test(code);
      return true;
    });
  }

  const rows: InsiderRow[] = filtered.map((t) => {
    const cik = t.cik || t.issuerCik || t.cikIssuer;
    const acc = t.accNo || t.accessionNumber || t.accession;
    const urls = buildSecUrls(cik, acc);

    const shares =
      asNum(t.shares) ??
      asNum(t.securitiesTransacted) ??
      asNum(t.amountOfSecuritiesTransacted);
    const price = asNum(t.price) ?? asNum(t.transactionPrice);
    const ownedAfter =
      asNum(t.sharesOwnedFollowingTransaction) ??
      asNum(t.securitiesOwnedFollowingTransaction);

    const acqDisp =
      t.acquisitionOrDisposition ||
      t.transactionType ||
      t.type ||
      t.ad ||
      t.transactionCode ||
      "";
    let txnTypeNorm: "A" | "D" | undefined;
    const code = (acqDisp || "").toString().toUpperCase();
    if (code.startsWith("A") || /PURCHASE|ACQ/.test(code)) txnTypeNorm = "A";
    else if (code.startsWith("D") || /SALE|DISP/.test(code)) txnTypeNorm = "D";

    const value = shares && price ? shares * price : undefined;

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
      cik: padCIK(cik),
      filedAt: cleanStr(t.filingDate),
      transDate: cleanStr(t.transactionDate) || cleanStr(t.transactionDate2),
      txnType: txnTypeNorm,
      shares,
      price,
      value,
      ownedAfter,
      formUrl: cleanStr(t.link) || urls.formUrl,
      indexUrl: urls.indexUrl,
      _accNo: cleanStr(acc),
    };
  });

  return { rows, meta: { source: "fmp", count: rows.length, page, perPage } };
}

// ---------- SEC fallback (pointer) ----------
async function fetchFromSECsymbolOnly(symbol?: string) {
  if (!symbol) return { rows: [], meta: { source: "sec", note: "no symbol" } };
  const q = encodeURIComponent(`${symbol} form 4`);
  const searchUrl = `https://www.sec.gov/edgar/search/#/category=custom&forms=4&q=${q}`;
  const row: InsiderRow = {
    source: "sec",
    insider: "—",
    issuer: "—",
    symbol,
    formUrl: searchUrl,
    indexUrl: searchUrl,
  };
  return { rows: [row], meta: { source: "sec", note: "search pointer" } };
}

// ---------- Handler ----------
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = cleanStr(searchParams.get("symbol") || "");
    const start = cleanStr(searchParams.get("start") || "");
    const end = cleanStr(searchParams.get("end") || "");
    const txnTypeRaw = (searchParams.get("txnType") || "ALL").toUpperCase();
    const txnType: "ALL" | "A" | "D" = (["A", "D"].includes(txnTypeRaw) ? txnTypeRaw : "ALL") as any;
    const page = Number(searchParams.get("page") || "1") || 1;
    const perPage = Math.min(200, Number(searchParams.get("perPage") || "50") || 50);

    // Require a symbol for server work
    if (!symbol) return json({ ok: true, rows: [], meta: { source: "none", count: 0 } });

    // 1) FMP PRIMARY
    const fmp = await fetchFromFMP({ symbol, start, end, txnType, page, perPage });
    let rows = fmp.rows;

    // 2) Enrich missing fields from SEC XML where possible (only when we have cik+acc)
    const enriched = await Promise.all(
      rows.map(async (r) => {
        if (r.source !== "fmp") return r;
        const hasAll = r.shares && r.price && r.ownedAfter && r.formUrl;
        if (hasAll) return r;
        const extra = await enrichFromSEC(r.cik, r._accNo);
        if (!extra) return r;

        const value =
          r.value ??
          (Number.isFinite(r.shares) && Number.isFinite(r.price)
            ? (r.shares as number) * (r.price as number)
            : (Number.isFinite(extra.shares) && Number.isFinite(extra.price)
                ? (extra.shares as number) * (extra.price as number)
                : undefined));

        return {
          ...r,
          formUrl: r.formUrl || extra.formUrl || extra.indexUrl,
          indexUrl: r.indexUrl || extra.indexUrl,
          txnType: r.txnType || extra.txnType,
          shares: r.shares ?? extra.shares,
          price: r.price ?? extra.price,
          ownedAfter: r.ownedAfter ?? extra.ownedAfter,
          filedAt: r.filedAt || extra.filedAt,
          transDate: r.transDate || extra.transDate,
          value,
        };
      })
    );

    rows = enriched;

    // If still nothing, give a SEC pointer so user can click
    if (!rows.length) {
      const sec = await fetchFromSECsymbolOnly(symbol);
      return json({ ok: true, rows: sec.rows, meta: sec.meta });
    }

    // Clean internal keys
    rows = rows.map(({ _accNo, ...rest }) => rest);

    return json({ ok: true, rows, meta: fmp.meta });
  } catch (e: any) {
    return err(e?.message || "Unexpected error", 500);
  }
}