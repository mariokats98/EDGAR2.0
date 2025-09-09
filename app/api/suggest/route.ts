// app/api/suggest/route.ts
import { NextRequest, NextResponse } from "next/server";

const SEC_UA = process.env.SEC_USER_AGENT || "herevna/1.0 (contact@herevna.io)";
const HEADERS = { "User-Agent": SEC_UA, Accept: "application/json; charset=utf-8" } as const;

export async function GET(req: NextRequest) {
  const q = (new URL(req.url)).searchParams.get("q")?.trim() || "";
  if (q.length < 1) return NextResponse.json({ ok: true, suggestions: [] }, { headers: { "Cache-Control": "no-store" } });

  try {
    const u = new URL("https://www.sec.gov/edgar/search/suggest");
    u.searchParams.set("keys", q);
    const r = await fetch(u.toString(), { headers: HEADERS, cache: "no-store" });
    if (!r.ok) return NextResponse.json({ ok: true, suggestions: [] }, { headers: { "Cache-Control": "no-store" } });
    const arr = (await r.json()) as string[];

    // Parse lines like: "NVIDIA CORP (NVDA) CIK0001045810"
    const out = arr.slice(0, 12).map((s) => {
      const cikMatch = s.match(/CIK0*([0-9]{1,10})/i);
      const tickerMatch = s.match(/\(([A-Z.\-]+)\)/);
      const name = s.replace(/\s*CIK0*[0-9]{1,10}\s*/i, "").replace(/\s*\([A-Z.\-]+\)\s*/g, "").trim();
      const cik = cikMatch ? cikMatch[1].padStart(10, "0") : null;
      const ticker = tickerMatch ? tickerMatch[1] : null;
      return { cik, ticker, name, display: s };
    }).filter(x => x.cik);

    return NextResponse.json({ ok: true, suggestions: out }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: true, suggestions: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}