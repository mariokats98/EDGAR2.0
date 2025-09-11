// app/api/insider/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type UiRow = {
  id: string;
  insider: string;
  issuer: string;
  symbol?: string;
  filedAt: string;
  type?: "A" | "D";
  beneficialShares?: number;        // "Amount of Securities Beneficially Owned Following..."
  price?: number;                   // transactionPricePerShare
  valueUSD?: number;                // price * amount
  amount?: number;                  // transactionShares (line item)
  docUrl?: string;                  // direct link to the XML
  title?: string;                   // securityTitle
  cik?: string;
  accessionNumber?: string;
  primaryDocument?: string;         // xml file name
};

// --------------------------------------------------
// small helpers
// --------------------------------------------------
const UA = { "User-Agent": "herevna.io (contact@herevna.io)" };

function okSymbol(sym?: string|null) {
  return sym ? sym.toUpperCase().trim() : undefined;
}
function normalizeDate(s?: string) {
  if (!s) return "—";
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : s;
}
function toNum(x: any): number | undefined {
  if (x == null) return;
  if (typeof x === "number") return Number.isFinite(x) ? x : undefined;
  if (typeof x === "string") {
    const n = Number(x.replace(/[$, ]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return;
}
function multiply(a?: number, b?: number) {
  return a != null && b != null ? a * b : undefined;
}
function dezero(s: string) {
  return s.replace(/^0+/, "");
}
function flatAcc(acc: string) {
  return acc.replace(/-/g, "");
}

// Get text inside the first occurrence of <tag>...</tag>
function tagValue(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : undefined;
}

// Return all blocks of <nonDerivativeTransaction>...</nonDerivativeTransaction>
function extractNonDerivativeTransactions(xml: string): string[] {
  const re = /<nonDerivativeTransaction[\s\S]*?<\/nonDerivativeTransaction>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[0]);
  return out;
}

// Extract first <reportingOwner> block (for insider name)
function extractFirstReportingOwner(xml: string): string | undefined {
  const block = (xml.match(/<reportingOwner[\s\S]*?<\/reportingOwner>/i) || [])[0];
  if (!block) return;
  const id = (block.match(/<reportingOwnerId[\s\S]*?<\/reportingOwnerId>/i) || [])[0];
  const name = id ? tagValue(id, "rptOwnerName") : undefined;
  return name;
}

// --------------------------------------------------
// SEC lookups
// --------------------------------------------------

// Resolve Ticker -> { cik, name }
async function resolveTicker(symbol: string): Promise<{ cik: string; name?: string } | null> {
  const res = await fetch("https://www.sec.gov/files/company_tickers_exchange.json", { headers: UA });
  if (!res.ok) return null;
  const data = await res.json() as any;
  // file is array-like object: {0:{ticker, cik, title}, 1:{...}, ...}
  const hit = Object.values(data as any).find((r: any) => (r?.ticker || "").toUpperCase() === symbol);
  if (!hit?.cik) return null;
  return {
    cik: String(hit.cik).padStart(10, "0"),
    name: hit.title
  };
}

// Pull recent submissions JSON
async function getSubmissions(cik: string): Promise<any|null> {
  const res = await fetch(`https://www.sec.gov/submissions/CIK${cik}.json`, { headers: UA, cache: "no-store" });
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

// Find a likely XML doc for a filing using the directory index
async function findXmlDoc(cikNoZeros: string, accFlat: string): Promise<string | null> {
  // index.json lists files in the filing directory
  const ix = await fetch(`https://www.sec.gov/Archives/edgar/data/${cikNoZeros}/${accFlat}/index.json`, { headers: UA });
  if (!ix.ok) return null;
  const j = await ix.json() as any;
  const items: any[] = j?.directory?.item || [];
  // prefer a form4*.xml or primary*.xml
  const preferred = items.find((it: any) => /\.xml$/i.test(it?.name) && /form4|primary/i.test(it?.name));
  if (preferred) return preferred.name;
  // else any xml
  const anyXml = items.find((it: any) => /\.xml$/i.test(it?.name));
  return anyXml ? anyXml.name : null;
}

// Parse a single Form 4 XML → array of UiRow (one per nonDerivativeTransaction)
function parseForm4XmlToRows(xml: string, ctx: {
  symbol?: string;
  issuer?: string;
  cik: string;
  accessionNumber: string;
  filedAt: string;
  baseUrl: string;          // https://www.sec.gov/Archives/edgar/data/{cikNoZeros}/{accFlat}/
  xmlName: string;
}): UiRow[] {
  const issuerName = tagValue(xml, "issuerName") || ctx.issuer || "—";
  const securityTitle = tagValue(xml, "securityTitle") || undefined;
  const insiderName = extractFirstReportingOwner(xml) || "—";

  const txBlocks = extractNonDerivativeTransactions(xml);
  if (txBlocks.length === 0) {
    // No line items; still return a summary row w/ link
    return [{
      id: `${ctx.cik}-${ctx.accessionNumber}-0`,
      insider: insiderName,
      issuer: issuerName,
      symbol: ctx.symbol,
      filedAt: normalizeDate(ctx.filedAt),
      type: undefined,
      beneficialShares: undefined,
      price: undefined,
      valueUSD: undefined,
      amount: undefined,
      docUrl: `${ctx.baseUrl}${ctx.xmlName}`,
      title: securityTitle,
      cik: ctx.cik,
      accessionNumber: ctx.accessionNumber,
      primaryDocument: ctx.xmlName,
    }];
  }

  const rows: UiRow[] = [];
  txBlocks.forEach((block, i) => {
    const amount = toNum(tagValue(block, "value") ?? tagValue(block, "transactionShares") ?? tagValue(block, "shares"));
    const typeVal = (tagValue(block, "transactionAcquiredDisposedCode") || "")
      .match(/<value>(A|D)<\/value>/i)?.[1]?.toUpperCase() as "A" | "D" | undefined;

    const price = toNum(tagValue(block, "transactionPricePerShare") ?? tagValue(block, "price"));
    const beneficial = toNum(tagValue(block, "sharesOwnedFollowingTransaction") ?? tagValue(block, "postTransactionAmounts"));

    rows.push({
      id: `${ctx.cik}-${ctx.accessionNumber}-${i + 1}`,
      insider: insiderName,
      issuer: issuerName,
      symbol: ctx.symbol,
      filedAt: normalizeDate(ctx.filedAt),
      type: typeVal,
      beneficialShares: beneficial,
      price,
      valueUSD: multiply(amount, price),
      amount,
      docUrl: `${ctx.baseUrl}${ctx.xmlName}`,
      title: securityTitle,
      cik: ctx.cik,
      accessionNumber: ctx.accessionNumber,
      primaryDocument: ctx.xmlName,
    });
  });

  return rows;
}

// --------------------------------------------------
// Main GET
// --------------------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = okSymbol(url.searchParams.get("symbol"));
    const start = url.searchParams.get("start") || "2024-01-01";
    const end = url.searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const type = (url.searchParams.get("type") || "ALL").toUpperCase() as "ALL" | "A" | "D";

    if (!symbol) {
      return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
    }

    // 1) Resolve ticker → CIK
    const resolved = await resolveTicker(symbol);
    if (!resolved) {
      return NextResponse.json({ ok: true, data: [] }); // no such ticker
    }
    const cik = resolved.cik;
    const cikNoZeros = dezero(cik);

    // 2) Pull submissions and filter Form 4 in date window
    const subs = await getSubmissions(cik);
    const recent = subs?.filings?.recent;
    if (!recent) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const forms: string[] = recent.form || [];
    const accs: string[] = recent.accessionNumber || [];
    const prims: string[] = recent.primaryDocument || [];
    const filed: string[] = recent.filingDate || [];
    const coName: string = subs?.name || resolved.name || symbol;

    const startMs = Date.parse(start);
    const endMs = Date.parse(end);

    const candidates: { acc: string; xml: string | null; filedAt: string }[] = [];

    // Collect candidate filings + ensure we know the XML filename
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] !== "4") continue;
      const filedAt = filed[i];
      const ts = Date.parse(filedAt);
      if (Number.isFinite(startMs) && ts < startMs) continue;
      if (Number.isFinite(endMs) && ts > endMs) continue;

      const acc = accs[i];
      let xml = prims[i] || null;

      const accFlat = flatAcc(acc);
      const baseUrl = `https://www.sec.gov/Archives/edgar/data/${cikNoZeros}/${accFlat}/`;

      // make sure we have an xml doc (primaryDocument might be HTML)
      if (!xml || !/\.xml$/i.test(xml)) {
        xml = await findXmlDoc(cikNoZeros, accFlat);
      }

      candidates.push({ acc, xml, filedAt });
    }

    // 3) Download & parse each XML
    const allRows: UiRow[] = [];
    for (const c of candidates) {
      if (!c.xml) {
        // no XML found; push a basic row w/ index.htm link
        const accFlat = flatAcc(c.acc);
        allRows.push({
          id: `${cik}-${c.acc}-0`,
          insider: "—",
          issuer: coName,
          symbol,
          filedAt: normalizeDate(c.filedAt),
          type: undefined,
          beneficialShares: undefined,
          price: undefined,
          valueUSD: undefined,
          amount: undefined,
          docUrl: `https://www.sec.gov/Archives/edgar/data/${cikNoZeros}/${accFlat}/index.htm`,
          title: "Form 4",
          cik,
          accessionNumber: c.acc,
          primaryDocument: "index.htm",
        });
        continue;
      }

      const accFlat = flatAcc(c.acc);
      const baseUrl = `https://www.sec.gov/Archives/edgar/data/${cikNoZeros}/${accFlat}/`;
      const xmlUrl = `${baseUrl}${c.xml}`;

      const res = await fetch(xmlUrl, { headers: UA, cache: "no-store" });
      if (!res.ok) {
        // fallback to index.htm row
        allRows.push({
          id: `${cik}-${c.acc}-0`,
          insider: "—",
          issuer: coName,
          symbol,
          filedAt: normalizeDate(c.filedAt),
          type: undefined,
          beneficialShares: undefined,
          price: undefined,
          valueUSD: undefined,
          amount: undefined,
          docUrl: `${baseUrl}index.htm`,
          title: "Form 4",
          cik,
          accessionNumber: c.acc,
          primaryDocument: "index.htm",
        });
        continue;
      }
      const xml = await res.text();
      const rows = parseForm4XmlToRows(xml, {
        symbol,
        issuer: coName,
        cik,
        accessionNumber: c.acc,
        filedAt: c.filedAt,
        baseUrl,
        xmlName: c.xml,
      });
      allRows.push(...rows);
    }

    // 4) filter by A/D if requested
    const filtered = (type === "ALL") ? allRows : allRows.filter(r => r.type === type);

    return NextResponse.json({ ok: true, data: filtered });
  } catch (e: any) {
    console.error("Insider route error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Internal error" }, { status: 500 });
  }
}