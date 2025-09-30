// app/api/insider/activity/route.ts
import { NextResponse } from "next/server";

const API = "https://financialmodelingprep.com/api/v4/insider-trading";
const KEY = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_KEY || "";

// tiny in-memory cache per lambda instance
type CacheEntry = { t: number; data: any };
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

function cacheGet(k: string) {
  const hit = CACHE.get(k);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.data;
  if (hit) CACHE.delete(k);
  return null;
}
function cacheSet(k: string, v: any) {
  CACHE.set(k, { t: Date.now(), data: v });
}

// --- helpers to robustly pull values from mixed schemas ---
const num = (v: any): number | undefined => {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/,/g, ""));
  return isFinite(n) ? n : undefined;
};

const pickString = (o: any, keys: string[]) => {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

// Many FMP variants: insiderName, name, reportingOwnerName, ownerName, officerName, etc.
function extractInsider(r: any) {
  const direct = pickString(r, [
    "insiderName",
    "insider",
    "name",
    "reportingOwnerName",
    "reportingName",
    "reportingOwner",
    "ownerName",
    "owner",
    "officerName",
    "officer",
    "reportedPerson",
    "reportingPerson",
    "reportingPersonName",
    "rptOwnerName",
  ]);
  if (direct) return direct;

  // Any other "*name" (but skip company/issuer names)
  for (const [k, v] of Object.entries(r)) {
    if (
      /name$/i.test(k) &&
      typeof v === "string" &&
      v.trim() &&
      !/issuer|company/i.test(k)
    ) {
      return v.trim();
    }
  }

  // Last-resort: show CIK so it’s not blank
  if (r.reportingCik) return `CIK ${r.reportingCik}`;
  return "";
}

function mapAction(r: any) {
  let a = String(
    r.acquistionOrDisposition || r.type || r.transactionType || ""
  ).toUpperCase();
  if (a.startsWith("P")) return "P-PURCHASE";
  if (a.startsWith("S")) return "S-SALE";
  if (a.includes("AWARD") || a === "A") return "A-AWARD";
  if (a.includes("RETURN") || a === "D") return "D-RETURN";
  return a || "—";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();
    const insider = (searchParams.get("insider") || "").trim().toLowerCase();
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";

    if (!KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing FMP_API_KEY" },
        { status: 500 }
      );
    }

    const qp = new URLSearchParams();
    if (ticker) qp.set("symbol", ticker);
    qp.set("page", "0");
    qp.set("apikey", KEY);

    const cacheKey = `insider:${qp.toString()}:${from}:${to}`;
    const cached = cacheGet(cacheKey);
    if (cached) return NextResponse.json({ ok: true, rows: cached });

    const res = await fetch(`${API}?${qp.toString()}`, { next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`FMP error ${res.status}: ${await res.text()}`);
    const raw = await res.json();

    const rows = (Array.isArray(raw) ? raw : []).map((r: any) => {
      const shares =
        num(r.shares) ??
        num(r.share) ??
        num(r.totalShares) ??
        num(r.securitiesTransacted);

      const price =
        num(r.price) ?? num(r.pricePerShare) ?? num(r.transactionPrice);

      const value =
        num(r.transactionValue) ??
        num(r.value) ??
        (shares && price ? shares * price : undefined);

      const who = extractInsider(r);
      const comp =
        r.companyName || r.issuerName || r.company || r.securityName || "";

      const dt = (r.transactionDate || r.filingDate || r.date || "").slice(0, 10);

      return {
        date: dt,
        insider: who,
        ticker: r.symbol || r.ticker || "",
        company: comp,
        action: mapAction(r),
        shares,
        price,
        value,
        link: r.link || r.formLink || r.url || undefined,
      };
    });

    // local filters
    const filtered = rows.filter((x) => {
      const okDate = (!from || x.date >= from) && (!to || x.date <= to);
      const okInsider = !insider || x.insider.toLowerCase().includes(insider);
      return okDate && okInsider;
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