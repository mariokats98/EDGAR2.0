// app/api/health/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const required = [
    "NEXTAUTH_URL","NEXTAUTH_SECRET",
    "DATABASE_URL","DIRECT_URL",
    "STRIPE_SECRET_KEY","STRIPE_PRICE_ID","STRIPE_WEBHOOK_SECRET"
  ];
  const status = Object.fromEntries(required.map(k => [k, process.env[k] ? "set" : "missing"]));
  return NextResponse.json({ ok: true, env: status });
}