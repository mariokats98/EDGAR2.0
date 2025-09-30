import { NextResponse } from "next/server";

/**
 * Normalizes FMP insider records into the shape the UI expects.
 */
function normalizeFmpRow(r: any) {
  // FMP v4 /insider-trading fields observed:
  // filingDate, transactionDate, symbol, companyName,
  // insiderName, transactionType, transactionShares, transactionPrice
  const shares =
    (typeof r.transactionShares === "number" && isFinite(r.transactionShares))
      ? r.transactionShares
      : Number(r.transactionShares ?? NaN);
  const price =
    (typeof r.transactionPrice === "number" && isFinite(r.transactionPrice))
      ? r.transactionPrice
      : Number(r.transactionPrice ?? NaN);

  // Map textual type to A/D where we can
  const t = (r.transactionType || "").toString().toUpperCase();
  let action: "A" | "D" | string | null = null;
  if (t.includes("BUY") || t.includes("ACQUIRE") || t === "A") action = "A";
  else if (t.includes("SELL") || t.includes("DISPOSE") || t === "D") action = "D";
  else action = t || null;

  return {
    date: r.transactionDate || r.filingDate || null,
    insider: r.insiderName || null,
    ticker: r.symbol || null,
    company: r.companyName || null,
    action,
    shares: Number.isFinite(shares) ? shares : null,
    price: Number.isFinite(price) ? price : null,
    value: Number.isFinite(shares) && Number.isFinite(price) ? shares * price : null,
    link: r.link || null,
    _raw: r,
  };
}

/**
 * Fetch helper with basic error → JSON.
 */
async function fetchJson(url: string) {
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstream ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

/**
 * GET /api/insider/activity
 * Query params supported:
 *  - symbol / ticker / q
 *  - insider / name
 *  - from (YYYY-MM-DD)
 *  - to (YYYY-MM-DD)
 *  - limit (default 200)
 *
 * Uses FMP v4 /insider-trading when symbol is present; otherwise pulls a
 * recent window and filters by insider if given.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const sym =
      (searchParams.get("symbol") ||
        searchParams.get("ticker") ||
        searchParams.get("q") ||
        "").toUpperCase();

    const insiderQ = (searchParams.get("insider") || searchParams.get("name") || "").trim();

    // date window
    const to =
      searchParams.get("to") ||
      searchParams.get("endDate") ||
      new Date().toISOString().slice(0, 10);

    const from =
      searchParams.get("from") ||
      searchParams.get("startDate") ||
      (() => {
        const d = new Date(to);
        // default: last 14 days
        d.setDate(d.getDate() - 14);
        return d.toISOString().slice(0, 10);
      })();

    const limit = Math.max(1, Math.min(2000, Number(searchParams.get("limit") || 200)));

    const key = process.env.FMP_API_KEY;
    if (!key) {
      return NextResponse.json(
        { ok: false, error: "Missing FMP_API_KEY env var" },
        { status: 500 }
      );
    }

    let rows: any[] = [];

    if (sym) {
      // Focused query by symbol
      const url = `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${encodeURIComponent(
        sym
      )}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&apikey=${encodeURIComponent(
        key
      )}`;
      const data = await fetchJson(url);
      rows = Array.isArray(data) ? data : [];
    } else {
      // No symbol: pull recent window and optionally filter by insider
      // NOTE: FMP supports date window without symbol as well.
      const url = `https://financialmodelingprep.com/api/v4/insider-trading?from=${encodeURIComponent(
        from
      )}&to=${encodeURIComponent(to)}&apikey=${encodeURIComponent(key)}`;
      const data = await fetchJson(url);
      rows = Array.isArray(data) ? data : [];
    }

    // Normalize
    let norm = rows.map(normalizeFmpRow);

    // Optional insider filter (client will also filter, but do it here too)
    if (insiderQ) {
      const q = insiderQ.toLowerCase();
      norm = norm.filter((r) => (r.insider || "").toLowerCase().includes(q));
    }

    // Sort newest first and cap limit
    norm.sort((a, b) => {
      const da = (a.date || "").slice(0, 10);
      const db = (b.date || "").slice(0, 10);
      if (da < db) return 1;
      if (da > db) return -1;
      return 0;
    });

    if (norm.length > limit) norm = norm.slice(0, limit);

    return NextResponse.json({ ok: true, rows: norm });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}