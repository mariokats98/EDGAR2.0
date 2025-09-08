// app/api/lookup/[symbol]/route.ts
import { NextRequest, NextResponse } from "next/server";
import mapData from "../../../data/tickerMap.json"; // <-- ensure this exists and is up-to-date

type Entry = {
  ticker: string;
  cik: string;
  name: string;
};

const SEC_USER_AGENT = process.env.SEC_USER_AGENT || "herevna.io (contact@herevna.io)";

// Build fast in-memory indexes once
const ALL: Entry[] = (() => {
  // Accept both possible shapes: array of objects OR object map
  // Prefer a unified {ticker, cik, name} array.
  const out: Entry[] = [];

  if (Array.isArray(mapData)) {
    for (const r of mapData as any[]) {
      if (!r) continue;
      const t = String(r.ticker || r.symbol || "").toUpperCase();
      const cik = String(r.cik || r.CIK || "").padStart(10, "0");
      const name = String(r.name || r.company || r.title || "").trim();
      if (t || (cik && name)) out.push({ ticker: t, cik, name });
    }
  } else if (mapData && typeof mapData === "object") {
    // shape: { "AAPL": { cik: "000...", name: "Apple Inc." }, ... }  OR  { "AAPL": "000..." }
    for (const [key, value] of Object.entries(mapData as Record<string, any>)) {
      const t = key.toUpperCase();
      if (typeof value === "string") {
        out.push({ ticker: t, cik: value.padStart(10, "0"), name: "" });
      } else {
        const cik = String(value.cik || value.CIK || "").padStart(10, "0");
        const name = String(value.name || value.company || "").trim();
        out.push({ ticker: t, cik, name });
      }
    }
  }
  // Deduplicate on (ticker || name || cik)
  const seen = new Set<string>();
  return out.filter((e) => {
    const k = `${e.ticker}|${e.cik}|${e.name.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
})();

// Secondary indexes
const BY_TICKER = new Map<string, Entry>();
const BY_CIK = new Map<string, Entry>();
for (const row of ALL) {
  if (row.ticker) BY_TICKER.set(row.ticker.toUpperCase(), row);
  if (row.cik) BY_CIK.set(row.cik.replace(/^0+/, ""), row);
}

// Very simple fuzzy scoring
function scoreCandidate(q: string, e: Entry) {
  const qn = q.toLowerCase();
  let score = 0;
  if (e.ticker) {
    const t = e.ticker.toLowerCase();
    if (t === qn) score += 100;
    else if (t.startsWith(qn)) score += 60;
    else if (t.includes(qn)) score += 30;
  }
  if (e.name) {
    const n = e.name.toLowerCase();
    if (n === qn) score += 90;
    else if (n.startsWith(qn)) score += 55;
    else if (n.includes(qn)) score += 25;
  }
  // slight boost if shorter ticker exact match vs. long name partials
  if (e.ticker && e.ticker.toLowerCase() === qn) score += 10;
  return score;
}

function normalizeToken(raw: string) {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/[^\w\.\-\s]/g, "")
    .toUpperCase();
}

export async function GET(
  req: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const raw = params.symbol || "";
    const token0 = raw.trim();
    if (!token0) {
      return NextResponse.json({ error: "Missing symbol or name" }, { status: 400 });
    }

    // Support queries like "NVDA", "NVIDIA", "0000320193"
    const token = normalizeToken(token0);

    // 1) If it looks like a 10-digit CIK
    const maybeCik = token.replace(/\D/g, "");
    if (maybeCik.length === 10 || maybeCik.length === 9) {
      const e = BY_CIK.get(maybeCik.replace(/^0+/, ""));
      if (e) {
        return NextResponse.json({
          ok: true,
          exact: { ticker: e.ticker, cik: e.cik, name: e.name || e.ticker },
          candidates: [],
          source: "cik",
        });
      }
    }

    // 2) Exact ticker match
    if (BY_TICKER.has(token)) {
      const e = BY_TICKER.get(token)!;
      return NextResponse.json({
        ok: true,
        exact: { ticker: e.ticker, cik: e.cik, name: e.name || e.ticker },
        candidates: [],
        source: "ticker_exact",
      });
    }

    // 3) Fuzzy search across both ticker and name
    const scored = ALL
      .map((e) => ({ e, s: scoreCandidate(token, e) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 10)
      .map(({ e }) => ({ ticker: e.ticker, cik: e.cik, name: e.name || e.ticker }));

    if (scored.length === 1) {
      return NextResponse.json({
        ok: true,
        exact: scored[0],
        candidates: [],
        source: "fuzzy_unique",
      });
    }

    if (scored.length > 1) {
      return NextResponse.json({
        ok: true,
        exact: null,
        candidates: scored,
        source: "fuzzy_multi",
        message: "Multiple matches — pick one.",
      });
    }

    // 4) Last resort: ask SEC's company-tickers endpoint live (just in case map is missing)
    try {
      const live = await fetch("https://www.sec.gov/files/company_tickers.json", {
        headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
        cache: "no-store",
      });
      if (live.ok) {
        const j = (await live.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
        const rows: Entry[] = Object.values(j).map((r) => ({
          ticker: String(r.ticker || "").toUpperCase(),
          cik: String(r.cik_str || "").padStart(10, "0"),
          name: String(r.title || "").trim(),
        }));
        const scoredLive = rows
          .map((e) => ({ e, s: scoreCandidate(token, e) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, 10)
          .map(({ e }) => ({ ticker: e.ticker, cik: e.cik, name: e.name || e.ticker }));

        if (scoredLive.length === 1) {
          return NextResponse.json({
            ok: true,
            exact: scoredLive[0],
            candidates: [],
            source: "sec_live_unique",
          });
        }
        if (scoredLive.length > 1) {
          return NextResponse.json({
            ok: true,
            exact: null,
            candidates: scoredLive,
            source: "sec_live_multi",
            message: "Multiple matches — pick one.",
          });
        }
      }
    } catch {
      // ignore
    }

    return NextResponse.json(
      { ok: false, error: `No matches for “${token0}”` },
      { status: 404 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Lookup error" },
      { status: 500 }
    );
  }
}
