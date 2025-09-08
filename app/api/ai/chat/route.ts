// app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

// Helper to make absolute URLs for server-side fetches
function getBaseUrl(req: NextRequest) {
  // Prefer NEXT_PUBLIC_SITE_URL in prod; fall back to Host header.
  const envBase =
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || "";
  if (envBase) return envBase;
  const host = req.headers.get("host") || headers().get("host") || "localhost:3000";
  const proto =
    req.headers.get("x-forwarded-proto") ||
    headers().get("x-forwarded-proto") ||
    "https";
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  try {
    const base = getBaseUrl(req);

    // Example: when your tool logic needs CPI series
    const qs = new URLSearchParams({
      ids: "CUUR0000SA0",
      start: "2018",
      end: new Date().getFullYear().toString(),
      freq: "monthly",
    }).toString();

    // ❌ was: fetch("/api/bls/series?..." )
    // ✅ now absolute:
    const r = await fetch(`${base}/api/bls/series?${qs}`, {
      cache: "no-store",
      // If your internal APIs need headers/cookies, forward minimal ones here
      headers: { Accept: "application/json" },
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j?.error || `BLS fetch failed (${r.status})`);
    }
    const bls = await r.json();

    // ... continue your AI tool logic / LLM call and respond
    return NextResponse.json({ ok: true, bls });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
