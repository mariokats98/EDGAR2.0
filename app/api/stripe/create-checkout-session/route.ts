import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(req: NextRequest) {
  try {
    const { from = "/" } = await req.json().catch(() => ({}));
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${process.env.STRIPE_SUCCESS_URL!}?session_id={CHECKOUT_SESSION_ID}&from=${encodeURIComponent(from)}`,
      cancel_url: process.env.STRIPE_CANCEL_URL!,
      allow_promotion_codes: true,
    });
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create checkout" }, { status: 500 });
  }
}