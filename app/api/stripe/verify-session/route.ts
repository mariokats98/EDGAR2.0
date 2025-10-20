import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(req: NextRequest) {
  try {
    const { session_id } = await req.json();
    if (!session_id) return NextResponse.json({ ok: false, error: "Missing session_id" }, { status: 400 });

    const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ["subscription"] });
    if (session.status !== "complete") {
      return NextResponse.json({ ok: false, error: "Checkout not completed" }, { status: 400 });
    }

    // Ensure subscription is active or trialing
    const subscription = session.subscription as Stripe.Subscription | null;
    const status = subscription?.status;
    const active = status === "active" || status === "trialing";

    if (!active) {
      return NextResponse.json({ ok: false, error: `Subscription status: ${status}` }, { status: 400 });
    }

    // ✅ Set Pro cookie (30 days)
    const res = NextResponse.json({ ok: true });
    res.headers.set(
      "Set-Cookie",
      `isPro=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax; Secure`
    );
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Verification failed" }, { status: 500 });
  }
}