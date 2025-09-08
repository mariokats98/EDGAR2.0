// app/api/lookup/[symbol]/route.ts
import { NextRequest, NextResponse } from "next/server";

const SEC_USER_AGENT = process.env.SEC_USER_AGENT || "herevna.io (contact@herevna.io)";

export async function GET(
  req: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const raw = (params.symbol || "").trim();
  if (!raw) return NextResponse.json({ ok: false, error: "Missing query" }, { status: 400 });

  const origin = `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host") || req.headers.get("host")}`;

  // Use our /api/suggest to get best matches
  const s = await fetch(`${origin}/api/suggest?q=${encodeURIComponent(raw)}`, {
    headers: { "User-Agent": SEC_USER_AGENT },
    cache: "no-store",
  });
  const j = await s.json().catch(() => ({}));
  const list: any[] = j?.data || [];

  if (!list.length) return NextResponse.json({ ok: false, error: "No matches" }, { status: 404 });
  if (list.length === 1) return NextResponse.json({ ok: true, exact: list[0], candidates: [] });

  // If there are multiple, try to pick a strong signal: exact ticker match
  const token = raw.toUpperCase();
  const exactTicker = list.find((x) => x.ticker === token);
  if (exactTicker) return NextResponse.json({ ok: true, exact: exactTicker, candidates: [] });

  // Otherwise return top 5 candidates for UI to pick from
  return NextResponse.json({ ok: true, exact: null, candidates: list.slice(0, 5) });
}
