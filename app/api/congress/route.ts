// app/api/congress/route.ts
import { NextResponse } from "next/server";

const FMP_KEY = process.env.FMP_API_KEY;

// export const runtime = "edge";

export async function GET(req: Request) {
  if (!FMP_KEY) {
    return NextResponse.json(
      { ok: false, error: "Missing FMP_API_KEY in environment." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);

  // inputs
  const chamber = (searchParams.get("chamber") || "senate").toLowerCase(); // "senate" | "house"
  const q = (searchParams.get("q") || "").trim();                          // member name or ticker
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || "25")));

  // NEW: optional date filters (YYYY-MM-DD)
  const from = (searchParams.get("from") || "").trim();
  const to = (searchParams.get("to") || "").trim();

  // choose endpoint
  const base =
    chamber === "house"
      ? "https://financialmodelingprep.com/api/v4/house-trading"
      : "https://financialmodelingprep.com/api/v4/senate-trading";

  // helper to try multiple param variants until we get data
  async function tryFetchWithVariants(): Promise<any[]> {
    const looksLikeTicker = /^[A-Z.\-]{1,6}$/.test(q.toUpperCase());

    // Build base URL with shared params
    const buildBase = () => {
      const u = new URL(base);
      u.searchParams.set("page", String(page));
      u.searchParams.set("apikey", FMP_KEY);

      // page size variants — some FMP endpoints use different names
      u.searchParams.set("limit", String(limit));
      u.searchParams.set("size", String(limit));
      u.searchParams.set("page_size", String(limit));

      // date variants — different datasets may use different keys
      if (from) {
        u.searchParams.set("from", from);
        u.searchParams.set("start", from);
        u.searchParams.set("dateFrom", from);
      }
      if (to) {
        u.searchParams.set("to", to);
        u.searchParams.set("end", to);
        u.searchParams.set("dateTo", to);
      }

      return u;
    };

    // Query variants we’ll attempt (in order) depending on whether q is a ticker or a name
    const variants: Array<Record<string, string>> = looksLikeTicker
      ? [
          { symbol: q.toUpperCase() },
          { ticker: q.toUpperCase() },
          { search: q.toUpperCase() },
        ]
      : [
          { name: q },            // many endpoints accept "name"
          { search: q },          // catch-all search
          { representative: q },  // house-flavored field in some datasets
          { senator: q },         // senate-flavored field in some datasets
        ];

    // Always include a no-filter attempt when q is empty
    if (!q) variants.unshift({});

    // Try each variant until one returns rows
    for (const v of variants) {
      const u = buildBase();
      for (const [k, val] of Object.entries(v)) u.searchParams.set(k, val);

      const r = await fetch(u.toString(), { cache: "no-store" });
      if (!r.ok) {
        // keep trying other variants, but remember last error text
        continue;
      }
      const data = await r.json();
      const list: any[] = Array.isArray(data) ? data : data?.data || [];
      if (list.length) return list;
    }

    // Last resort: try the base URL with only shared params (no q)
    const u = buildBase();
    const r = await fetch(u.toString(), { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      const list: any[] = Array.isArray(data) ? data : data?.data || [];
      return list;
    }

    return [];
  }

  try {
    const list = await tryFetchWithVariants();

    const rows = list.map((x: any, i: number) => {
      const first = x.first_name || x.firstName;
      const last = x.last_name || x.lastName;
      const politician =
        x.representative ||
        x.senator ||
        x.member ||
        x.politician ||
        [first, last].filter(Boolean).join(" ").trim() ||
        undefined;

      const ticker =
        x.ticker ||
        x.assetTicker ||
        x.symbol ||
        x.tickerSymbol ||
        x.stock ||
        undefined;

      const assetName =
        x.assetName ||
        x.asset ||
        x.securityName ||
        x.asset_description ||
        undefined;

      const filingDate =
        x.filingDate || x.disclosureDate || x.reportDate || x.filed || x.date;

      const transactionDate =
        x.transactionDate || x.txnDate || x.tradeDate || x.transaction_date;

      const type =
        x.type || x.transaction || x.transactionType || x.action;

      const amount =
        x.amount || x.amountRange || x.amount_range || x.range;

      const link = x.link || x.source || x.url;

      return {
        id: x.id ?? `${chamber}-${page}-${i}`,
        filingDate,
        transactionDate,
        representative: chamber === "house" ? politician : undefined,
        senator: chamber === "senate" ? politician : undefined,
        party: x.party,
        state: x.state || x.member_state,
        ticker,
        assetName,
        type,
        amount,
        link,
      };
    });

    // If a date filter was supplied but rows came back, also do a soft client-side filter
    const filtered = rows.filter((r) => {
      if (!from && !to) return true;
      const d = new Date(r.transactionDate || r.filingDate || "");
      if (Number.isNaN(d.getTime())) return true;
      if (from && d < new Date(from)) return false;
      if (to && d > new Date(to)) return false;
      return true;
    });

    // Hard cap to the requested limit
    const pageRows = filtered.slice(0, limit);

    return NextResponse.json({ ok: true, rows: pageRows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Fetch failed" },
      { status: 500 }
    );
  }
}