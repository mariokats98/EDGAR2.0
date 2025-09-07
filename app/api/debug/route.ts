import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    runtime: "nodejs",
    env: {
      SEC_USER_AGENT: !!process.env.SEC_USER_AGENT,
      NODE_ENV: process.env.NODE_ENV || null,
    },
    routesExpected: [
      "/api/lookup/[symbol]",
      "/api/suggest",
      "/api/filings/[cik]"
    ],
  });
}
