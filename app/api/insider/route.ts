// app/api/insider/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type RawInsider = Record<string, any>;

function toAD(r: RawInsider): "A" | "D" | "?" {
  // Prefer explicit A/D if present
  const ad = r.acquisitionOrDisposition || r.acqDispCode;
  if (ad === "A" || ad === "D") return ad;

  // Map common codes if only a "transactionType" like 'P' (purchase) / 'S' (sale)
  const tt = (r.transactionType || r.type || "").toString().toUpperCase();
  if (tt.startsWith("P")) return "A";
  if (tt.startsWith("S")) return "D";

  return "?";
}

function numberOrNull(v: any): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[, ]+/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function best<T>(...candidates: T[]): T | undefined {
  for (const c of candidates) if (c !== undefined && c !== null && c !== "") return c;
  return undefined;
}

function toDocUrl(r: RawInsider): string | undefined {
  // FMP often returns one of these
  const link = best(r.link, r.filingUrl, r.documentUrl, r.finalLink, r.url);
  if (link) return link;

  // Fallback: issuer CIK browse page filtered for form 4
  const cik = r.issuerCik || r.cik || r.issuer_cik || r.reportedIssuerCik;
  if (cik) {
    const padded = String(cik).padStart(10, "0");
    return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${padded}&type=4&owner=only&count=40`;
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase().trim();
    const start = searchParams.get("start") || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const end = searchParams.get("end") || new Date().toISOString().slice(0, 10);
    const txnType = (searchParams.get("txnType") || "ALL").toUpperCase(); // ALL | A | D
    const page = Number(searchParams.get("page") || "0");
    const limit = Number(searchParams.get("limit") || "50");

    const key = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_KEY;
    if (!key) {
      return NextResponse.json({ ok: false, error: "Missing FMP API key" }, { status: 500 });
    }

    // Build FMP URL (v4 insider trading)
    // Symbol may be omitted to get a market-wide tape (date-filtered).
    const base = new URL("https://financialmodelingprep.com/api/v4/insider-trading");
    if (symbol) base.searchParams.set("symbol", symbol);
    base.searchParams.set("from", start);
    base.searchParams.set("to", end);
    base.searchParams.set("page", String(page));
    base.searchParams.set("apikey", key);

    const res = await fetch(base.toString(), { next: { revalidate: 0 }, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: `FMP fetch failed ${res.status}`, details: text }, { status: 502 });
    }
    const raw: RawInsider[] = await res.json();

    // Normalize
    let rows = (Array.isArray(raw) ? raw : []).map((r) => {
      const ad = toAD(r);

      const shares =
        numberOrNull(best(r.transactionShares, r.shares, r.securitiesTransacted, r.transactionAmount)) ?? null;
      const price = numberOrNull(best(r.transactionPrice, r.price)) ?? null;
      const value = shares && price ? Math.round(shares * price * 100) / 100 : null;

      const ownedAfter =
        numberOrNull(best(r.securitiesOwned, r.postShares, r.sharesOwnedFollowing, r.sharesOwned)) ?? null;

      const issuer = best(
        r.issuerName,
        r.companyName,
        r.issuer,
        r.reportedIssuerName
      ) as string | undefined;

      const insider = best(
        r.reportingName,
        r.insiderName,
        r.reportingOwnerName,
        r.ownerName
      ) as string | undefined;

      const filingDate = best(r.filingDate, r.fileDate, r.filedAt, r.date) as string | undefined;
      const transactionDate = best(r.transactionDate, r.tranDate) as string | undefined;

      const symbolNorm = best(r.symbol, r.ticker, r.issuerTradingSymbol) as string | undefined;

      const formType = best(r.formType, r.form) as string | undefined;

      return {
        id:
          best(r.id, r.accno, r.accessionNumber, `${symbolNorm || ""}-${filingDate || ""}-${insider || ""}`) || crypto.randomUUID(),
        symbol: (symbolNorm || "").toUpperCase(),
        issuer: issuer || (symbolNorm || "—"),
        insider: insider || "—",
        ad, // A or D or ?
        transactionDate: transactionDate || filingDate || "—",
        filingDate: filingDate || "—",
        shares,
        price,
        value,
        ownedAfter,
        formType: formType || "4",
        documentUrl: toDocUrl(r),
      };
    });

    // Filter by A/D if requested
    if (txnType === "A" || txnType === "D") {
      rows = rows.filter((r) => r.ad === txnType);
    }

    // Basic pagination slice (FMP page already helps; this guards odd pages)
    const data = rows.slice(0, limit);

    return NextResponse.json({
      ok: true,
      count: data.length,
      total: rows.length,
      start,
      end,
      symbol: symbol || null,
      txnType,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected error in insider route" },
      { status: 500 }
    );
  }
}