import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    return NextResponse.json({ status: s.status, customer: s.customer, subscription: s.subscription });
  } catch (err: any) {
    console.error("verify-session error:", err);
    return NextResponse.json({ error: err.message ?? "Stripe error" }, { status: 500 });
  }
}