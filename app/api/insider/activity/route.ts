// app/api/insider/activity/route.ts
import { NextResponse } from "next/server";

const API = "https://financialmodelingprep.com/api/v4/insider-trading";
const KEY = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_KEY || "";

// super-light in-memory cache (per Lambda instance)
type CacheEntry = { t: number; data: any };
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60_000; // 1 minute

function cacheGet(key: string) {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.data;
  if (hit) CACHE.delete(key);
  return null;
}
function cacheSet(key: string, data: any) {
  CACHE.set(key, { t: Date.now(), data });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();
    const insider = (searchParams.get("insider") || "").trim();
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";

    if (!KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing FMP_API_KEY" },
        { status: 500 }
      );
    }

    // FMP lets you filter by symbol; for insider name we’ll filter locally.
    const qp = new URLSearchParams();
    if (ticker) qp.set("symbol", ticker);
    qp.set("page", "0");
    qp.set("apikey", KEY);

    const cacheKey = `insider:${qp.toString()}:${from}:${to}`;
    const cached = cacheGet(cacheKey);
    if (cached) return NextResponse.json({ ok: true, rows: cached });

    const url = `${API}?${qp.toString()}`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`FMP error ${res.status}: ${text}`);
    }
    const raw = await res.json();

    // Normalize rows (FMP fields vary slightly across endpoints)
    const rows = (Array.isArray(raw) ? raw : []).map((r: any) => {
      const shares =
        Number(r.shares || r.share || r.totalShares || r.securitiesTransacted) ||
        undefined;
      const price =
        Number(r.price || r.pricePerShare || r.transactionPrice) || undefined;
      const value =
        Number(
          r.transactionValue || r.value || (shares && price ? shares * price : 0)
        ) || (shares && price ? shares * price : undefined);
      const who =
        r.personName ||
        r.insiderName ||
        r.owner ||
        r.officer ||
        r.reportingOwner ||
        r.reportedPerson ||
        r.name ||
        "";

      const comp = r.companyName || r.issuerName || r.company || r.securityName;

      // Dates from FMP often appear as "yyyy-MM-dd" or ISO — keep first 10 chars
      const dt = (r.transactionDate || r.filingDate || r.date || "").slice(0, 10);

      // Action mapping (P, S, Award, etc)
      let action = String(r.acquistionOrDisposition || r.type || r.transactionType || "")
        .toUpperCase();
      if (action.startsWith("P")) action = "P-PURCHASE";
      else if (action.startsWith("S")) action = "S-SALE";
      else if (action.includes("AWARD") || action === "A") action = "A-AWARD";
      else if (action.includes("RETURN") || action === "D") action = "D-RETURN";

      return {
        date: dt,
        insider: who,
        ticker: r.symbol || r.ticker || "",
        company: comp || "",
        action,
        shares,
        price,
        value,
        link: r.link || r.formLink || r.url || undefined,
      } as const;
    });

    // Apply date + insider filters locally
    const filtered = rows.filter((r: any) => {
      const inDate =
        (!from || r.date >= from) && (!to || r.date <= to);
      const inInsider =
        !insider ||
        r.insider.toLowerCase().includes(insider.toLowerCase());
      return inDate && inInsider;
    });

    cacheSet(cacheKey, filtered);
    return NextResponse.json({ ok: true, rows: filtered });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}