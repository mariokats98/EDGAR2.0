// app/api/congress/route.ts
import { NextRequest, NextResponse } from "next/server";

const FMP_BASE = "https://financialmodelingprep.com/api/v4";
const SENATE_EP = `${FMP_BASE}/senate-trading`;
const HOUSE_EP  = `${FMP_BASE}/house-trading`;

function dateOnly(s?: string) {
  return (s || "").slice(0, 10);
}
function clean(s?: string) {
  return (s || "").normalize("NFKD").replace(/\s+/g, " ").trim();
}
function norm(s?: string) {
  return clean(s).toLowerCase();
}

// unify row coming from senate/house feeds
function mapRow(raw: any) {
  const member =
    clean(raw?.representative) ||
    clean(raw?.senator) ||
    clean(raw?.politicianName) ||
    clean(raw?.name) ||
    clean(raw?.owner) ||
    "";

  const ticker =
    clean(raw?.ticker) ||
    clean(raw?.assetTicker) ||
    clean(raw?.symbol) ||
    "";

  const company =
    clean(raw?.assetDescription) ||
    clean(raw?.company) ||
    clean(raw?.asset_name) ||
    "";

  const action =
    clean(raw?.typeOfTransaction) ||
    clean(raw?.transaction) ||
    clean(raw?.type) ||
    clean(raw?.action) ||
    "";

  const amountText =
    clean(raw?.amount) ||
    clean(raw?.amountRange) ||
    clean(raw?.transactionAmount) ||
    "";

  const link =
    clean(raw?.link) ||
    clean(raw?.source) ||
    "";

  // numeric fields (may be missing in FMP)
  const shares = Number(raw?.shares);
  const price = Number(raw?.price);
  const value = Number(raw?.value);

  // dates: FMP provides different shapes; prefer transactionDate, else report/filing date
  const date =
    dateOnly(raw?.transactionDate) ||
    dateOnly(raw?.trade_date) ||
    dateOnly(raw?.date) ||
    dateOnly(raw?.filed) ||
    "";

  return {
    date,
    filed: dateOnly(raw?.filed) || "",
    member,
    ticker,
    company,
    action,
    shares: Number.isFinite(shares) ? shares : undefined,
    price: Number.isFinite(price) ? price : undefined,
    value: Number.isFinite(value) ? value : undefined,
    amountText,
    owner: clean(raw?.owner) || "",
    link,
    _raw: raw,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chamber = (searchParams.get("chamber") || "senate").toLowerCase() as
      | "senate"
      | "house";

    const memberQ = norm(searchParams.get("member") || "");
    const tickerQ = clean(searchParams.get("ticker") || "").toUpperCase();
    const q = norm(searchParams.get("q") || "");

    const from = searchParams.get("from"); // YYYY-MM-DD
    const to = searchParams.get("to");     // YYYY-MM-DD

    // Build upstream URL (FMP supports pagination; we grab a fair slice)
    const apiKey = process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_KEY || "";
    const baseUrl = chamber === "house" ? HOUSE_EP : SENATE_EP;

    const upstreamUrl = new URL(baseUrl);
    upstreamUrl.searchParams.set("page", "0");
    upstreamUrl.searchParams.set("size", "500"); // adjust if you want more
    if (apiKey) upstreamUrl.searchParams.set("apikey", apiKey);

    const res = await fetch(upstreamUrl.toString(), { cache: "no-store" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json({ ok: false, error: `FMP error ${res.status}: ${txt}` }, { status: 502 });
    }
    const json = await res.json();
    const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];

    // map + local filtering
    let rows = list.map(mapRow);

    // date filter
    if (from || to) {
      const fromT = from ? new Date(from + "T00:00:00Z").getTime() : undefined;
      const toT = to ? new Date(to + "T23:59:59Z").getTime() : undefined;
      rows = rows.filter((r) => {
        const t = r.date ? new Date(r.date + "T12:00:00Z").getTime() : NaN; // midday to avoid TZ edge cases
        if (!Number.isFinite(t)) return false;
        if (fromT && t < fromT) return false;
        if (toT && t > toT) return false;
        return true;
      });
    }

    // member filter
    if (memberQ) {
      rows = rows.filter((r) => norm(r.member).includes(memberQ));
    }

    // ticker filter
    if (tickerQ) {
      rows = rows.filter((r) => (r.ticker || "").toUpperCase() === tickerQ);
    }

    // free-text search across member/ticker/company
    if (q) {
      rows = rows.filter((r) => {
        const blob = `${r.member} ${r.ticker} ${r.company}`;
        return norm(blob).includes(q);
      });
    }

    // sort newest first
    rows.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}