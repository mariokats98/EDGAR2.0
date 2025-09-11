// app/api/insider/route.ts
// @ts-nocheck
/* Robust Form 4 insider-tape API for Herevna
   - Query by ?symbol=NVDA or ?cik=0000320193 or ?issuer=Apple
   - Optional: start=YYYY-MM-DD, end=YYYY-MM-DD, action=A|D|ALL, page, perPage
   - Returns shares, A/D, price, value (shares*price), beneficially owned after, and EDGAR links.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

// ---------- helpers ----------
function json(data, init) {
  return NextResponse.json(data, init);
}
function err(message, status = 400) {
  return json({ error: message }, { status });
}

const SEC_UA =
  process.env.SEC_USER_AGENT ||
  "herevna.ai/1.0 (admin@herevna.io; +https://herevna.io)";

async function fetchJSON(url) {
  const r = await fetch(url, {
    headers: { "user-agent": SEC_UA, accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  return await r.json();
}

async function fetchTEXT(url) {
  const r = await fetch(url, {
    headers: { "user-agent": SEC_UA, accept: "*/*" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${url}`);
  return await r.text();
}

function asDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

function cikNoLeadingZeros(cik) {
  return String(parseInt(cik, 10));
}
function accessionNoDashes(acc) {
  return acc.replace(/-/g, "");
}

function extractAll(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}
function extractOne(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : undefined;
}

// Dedicated, accurate grabs for Form 4 (Table 1) fields inside a transaction block:
function grabShares(blk) {
  const m = blk.match(/<transactionShares[^>]*>[\s\S]*?<value>(.*?)<\/value>/i);
  return m ? Number(m[1].replace(/[, ]/g, "")) : undefined;
}
function grabAD(blk) {
  // A or D is nested:
  const m = blk.match(
    /<transactionAcquiredDisposedCode[^>]*>[\s\S]*?<value>([AD])<\/value>/i
  );
  return m ? (m[1].toUpperCase() === "A" ? "A" : "D") : "—";
}
function grabPrice(blk) {
  const m = blk.match(
    /<transactionPricePerShare[^>]*>[\s\S]*?<value>(.*?)<\/value>/i
  );
  return m ? Number(m[1].replace(/[, ]/g, "")) : undefined;
}
function grabOwnedFollowing(blk) {
  const m = blk.match(
    /<postTransactionAmounts[^>]*>[\s\S]*?<sharesOwnedFollowingTransaction[^>]*>[\s\S]*?<value>(.*?)<\/value>/i
  );
  return m ? Number(m[1].replace(/[, ]/g, "")) : undefined;
}

// ---------- SEC lookups ----------
async function getCikFromSymbol(raw) {
  const symbol = (raw || "").trim().toUpperCase();
  if (!symbol) return null;
  const url = "https://www.sec.gov/files/company_tickers.json";
  const data = await fetchJSON(url); // { "0": {cik,ticker,title}, ... }
  const hit = Object.values(data).find(
    (r) => r?.ticker?.toUpperCase() === symbol
  );
  if (!hit) return null;
  return { cik: String(hit.cik).padStart(10, "0"), name: hit.title };
}

async function getRecentForm4ForCik(cik) {
  const padded = cik.padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
  const sub = await fetchJSON(url);
  const recent = sub?.filings?.recent;
  if (!recent) return [];

  const out = [];
  const forms = recent.form || [];
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === "4") {
      out.push({
        form: forms[i],
        accessionNumber: recent.accessionNumber?.[i],
        reportDate: recent.reportDate?.[i],
        filingDate: recent.filingDate?.[i],
        primaryDoc: recent.primaryDocument?.[i],
        symbol: recent.ticker?.[i],
      });
    }
  }
  return out;
}

async function parseForm4Details({ cik, accessionNumber, primaryDoc }) {
  const cikNo0 = cikNoLeadingZeros(cik);
  const accDir = accessionNoDashes(accessionNumber);

  const candidates = [
    primaryDoc,
    "form4.xml",
    "primary_doc.xml",
    "ownership.xml",
  ].filter(Boolean);

  let xmlText = null;
  let used;

  for (const cand of candidates) {
    const url = `https://www.sec.gov/Archives/edgar/data/${cikNo0}/${accDir}/${cand}`;
    try {
      const t = await fetchTEXT(url);
      if (t && t.includes("<ownershipDocument")) {
        xmlText = t;
        used = cand;
        break;
      }
    } catch {}
  }

  if (!xmlText) {
    // try index.json to locate xml
    try {
      const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNo0}/${accDir}/index.json`;
      const idx = await fetchJSON(indexUrl);
      const guess = idx?.directory?.item?.find((it) =>
        String(it.name || "").toLowerCase().endsWith(".xml")
      );
      if (guess) {
        const alt = `https://www.sec.gov/Archives/edgar/data/${cikNo0}/${accDir}/${guess.name}`;
        const t = await fetchTEXT(alt);
        if (t && t.includes("<ownershipDocument")) {
          xmlText = t;
          used = guess.name;
        }
      }
    } catch {}
  }

  if (!xmlText) return null;

  const issuerName =
    extractOne(xmlText, "issuerName") ||
    extractOne(xmlText, "issuerNameText") ||
    "—";
  const issuerSymbol =
    extractOne(xmlText, "issuerTradingSymbol") ||
    extractOne(xmlText, "issuerSymbol") ||
    undefined;

  const firstOwner = extractAll(xmlText, "reportingOwner")[0] || "";
  const insiderName =
    extractOne(firstOwner, "rptOwnerName") ||
    extractOne(firstOwner, "reportingOwnerName") ||
    "—";

  const txBlocks = extractAll(xmlText, "nonDerivativeTransaction");
  const rows = txBlocks.map((blk) => {
    const shares = grabShares(blk);
    const action = grabAD(blk);
    const price = grabPrice(blk);
    const ownedFollowing = grabOwnedFollowing(blk);
    return { action, shares, price, ownedFollowing };
  });

  const base = `https://www.sec.gov/Archives/edgar/data/${cikNo0}/${accDir}`;
  return {
    issuer: issuerName,
    symbol: issuerSymbol,
    insider: insiderName,
    formUrl: `${base}/${used || "form4.xml"}`,
    indexUrl: `${base}/index.html`,
    transactions: rows,
  };
}

// ---------- API route ----------
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const symbol = searchParams.get("symbol") || "";
    let cik = searchParams.get("cik") || "";
    let issuerQuery = searchParams.get("issuer") || "";

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

    if (symbol && !cik) {
      const hit = await getCikFromSymbol(symbol);
      if (!hit) return err("Could not resolve symbol to CIK", 404);
      cik = hit.cik;
      if (!issuerQuery) issuerQuery = hit.name;
    }

    if (!symbol && !cik && issuerQuery) {
      try {
        const url = "https://www.sec.gov/files/company_tickers.json";
        const data = await fetchJSON(url);
        const hit = Object.values(data).find((r) =>
          (r.title || "").toLowerCase().includes(issuerQuery.toLowerCase())
        );
        if (hit) cik = String(hit.cik).padStart(10, "0");
      } catch {}
    }

    if (!cik) return err("Unable to resolve a CIK from your query.", 404);

    // fetch recent Form 4 list for that CIK
    const filings = await getRecentForm4ForCik(cik);

    // date filter (filingDate)
    const startDate = asDate(startStr);
    const endDate = asDate(endStr);
    const byDate = filings.filter((f) => {
      const d = asDate(f.filingDate);
      if (!d) return false;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });

    const total = byDate.length;
    const offset = (page - 1) * perPage;
    const slice = byDate.slice(offset, offset + perPage);

    const details = await Promise.all(
      slice.map((f) =>
        parseForm4Details({
          cik,
          accessionNumber: f.accessionNumber,
          primaryDoc: f.primaryDoc,
        }).catch(() => null)
      )
    );

    const actionMode = actionRaw === "A" || actionRaw === "D" ? actionRaw : "ALL";

    const rows = [];
    for (let i = 0; i < slice.length; i++) {
      const f = slice[i];
      const d = details[i];
      if (!d) continue;

      const filedAt = f.filingDate || f.reportDate || "—";
      const issuer = d.issuer || "—";
      const sy = d.symbol || f.symbol;
      const insider = d.insider || "—";

      if (!d.transactions || d.transactions.length === 0) {
        rows.push({
          insider,
          issuer,
          symbol: sy,
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
          symbol: sy,
          filedAt,
          action: tx.action, // "A" or "D"
          shares: tx.shares, // "Securities Acquired (A) or Disposed Of (D)" -> Amount
          price: tx.price, // Price/Share
          value, // shares*price
          ownedFollowing: tx.ownedFollowing, // "Beneficially Owned Following"
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
        cik,
        issuer: issuerQuery || null,
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
  } catch (e) {
    return err(e?.message || "Unexpected server error", 500);
  }
}