// app/api/stripe/verify-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  const sess = await stripe.checkout.sessions.retrieve(sessionId);
  return NextResponse.json({
    id: sess.id,
    status: sess.status,
    customer: typeof sess.customer === "string" ? sess.customer : sess.customer?.id,
    subscription: typeof sess.subscription === "string" ? sess.subscription : sess.subscription?.id,
  });
}