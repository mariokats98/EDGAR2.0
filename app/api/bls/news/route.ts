// app/api/bls/news/route.ts
import { NextResponse } from "next/server";

// Keep everything dynamic and Node runtime so our UA is used.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  // pass through q, limit, debug to /api/bls/releases
  const q = url.searchParams.get("q") || "";
  const limit = url.searchParams.get("limit") || "";
  const debug = url.searchParams.get("debug") || "";

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (limit) qs.set("limit", limit);
  if (debug) qs.set("debug", debug);

  const target = `${url.origin}/api/bls/releases${qs.toString() ? `?${qs.toString()}` : ""}`;

  const r = await fetch(target, { cache: "no-store" });
  const j = await r.json();
  return NextResponse.json(j, { status: r.status });
}


