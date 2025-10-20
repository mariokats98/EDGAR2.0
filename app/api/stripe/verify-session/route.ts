// app/api/stripe/verify-session/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  return NextResponse.json({ authenticated: !!session?.user?.email });
}