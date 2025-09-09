// app/api/suggest/route.ts
import { NextResponse } from "next/server";

// --- Config ---
const UA = process.env.SEC_USER_AGENT || "your-email@example.com";
const SEC_JSON_URL = "https://www.sec.gov/files/company_tickers.json";

// --- In-memory cache (per serverless instance) ---
type SecRow = { cik: string; ticker: string; name: string };
let _cache: { rows: SecRow[]; at: number } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

async function loadTickers(): Promise<SecRow[]> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.rows;

  // SEC JSON is an object keyed by 0..N; each value {ticker, title, cik_str}
  const r = await fetch(SEC_JSON_URL, {
    headers: { "User-Agent": UA, "Accept": "application/json" },
    // No-store: keep SEC happy; we cache in-memory ourselves
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC tickers fetch failed (${r.status})`);

  const j = (await r.json()) as Record<
    string,
    { ticker: string; title: string; cik_str: number }
  >;

  const rows: SecRow[] = Object.values(j).map((v) => ({
    cik: String(v.cik_str).padStart(10, "0"),
    ticker: v.ticker.toUpperCase(),
    name: v.title,
  }));

  _cache = { rows, at: Date.now() };
  return rows;
}

function normalizeTickerLike(s: string) {
  // Accept BRK.B / BRK-B / brk.b → BRK.B
  return s.trim().toUpperCase().replace(/-/g, ".").replace(/\s+/g, " ");
}

function scoreCandidate(q: string, row: SecRow): number {
  // Simple, fast fuzzy scoring:
  // startsWith ticker > exact word in name > substring in name > substring in ticker
  const t = row.ticker;
  const n = row.name.toUpperCase();

  let score = 0;

  if (t.startsWith(q)) score += 100;
  if (t === q) score += 50;

  // token match in name
  const tokens = q.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    if (n.startsWith(tok)) score += 25;
    if (n.includes(` ${tok}`)) score += 15;
    if (n.includes(tok)) score += 8;
  }

  // generic substring boosts
  if (n.includes(q)) score += 6;
  if (t.includes(q)) score += 5;

  return score;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = (searchParams.get("q") || "").trim();
    if (!raw) return NextResponse.json({ ok: true, suggestions: [] });

    const rows = await loadTickers();

    // If it looks like a CIK (digits only)
    if (/^\d{1,10}$/.test(raw)) {
      const cik = raw.padStart(10, "0");
      const hit = rows.find((r) => r.cik === cik);
      if (hit) {
        return NextResponse.json({
          ok: true,
          suggestions: [
            {
              label: `${hit.ticker} — ${hit.name} (CIK ${hit.cik})`,
              cik: hit.cik,
              ticker: hit.ticker,
              name: hit.name,
              value: hit.cik, // what the client should “pick”
            },
          ],
        });
      }
    }

    const q = normalizeTickerLike(raw);
    // Rank all rows, keep the top 20
    const ranked = rows
      .map((r) => ({ r, s: scoreCandidate(q, r) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 20)
      .map(({ r }) => ({
        label: `${r.ticker} — ${r.name} (CIK ${r.cik})`,
        cik: r.cik,
        ticker: r.ticker,
        name: r.name,
        value: r.cik,
      }));

    // If we didn't get anything, try a loose substring fallback
    const fallback =
      ranked.length > 0
        ? ranked
        : rows
            .filter(
              (r) =>
                r.ticker.includes(q) ||
                r.name.toUpperCase().includes(q)
            )
            .slice(0, 10)
            .map((r) => ({
              label: `${r.ticker} — ${r.name} (CIK ${r.cik})`,
              cik: r.cik,
              ticker: r.ticker,
              name: r.name,
              value: r.cik,
            }));

    return NextResponse.json({ ok: true, suggestions: fallback });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Suggest failed" },
      { status: 500 }
    );
  }
}