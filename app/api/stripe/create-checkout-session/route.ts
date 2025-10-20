import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

function getOrigin(req: NextRequest) {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const hdr = req.headers.get("origin") || "";
  return envUrl || hdr || "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  try {
    // ---- Parse + validate input ----
    const body = await req.json().catch(() => ({}));
    const emailRaw = typeof body?.email === "string" ? body.email.trim() : "";
    const from = typeof body?.from === "string" ? body.from : "/subscribe";

    // Only set customer_email if it's non-empty and contains "@"
    const customer_email =
      emailRaw && /\S+@\S+\.\S+/.test(emailRaw) ? emailRaw : undefined;

    // ---- Validate env vars ----
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return NextResponse.json(
        { error: "Missing STRIPE_PRICE_ID env var." },
        { status: 500 }
      );
    }
    if (!/^price_/.test(priceId)) {
      return NextResponse.json(
        {
          error:
            "STRIPE_PRICE_ID must start with 'price_'. You may have pasted a Product ID (prod_...).",
        },
        { status: 500 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY || !/^sk_/.test(process.env.STRIPE_SECRET_KEY)) {
      return NextResponse.json(
        { error: "STRIPE_SECRET_KEY is missing or invalid." },
        { status: 500 }
      );
    }

    const origin = getOrigin(req);

    // ---- Create Checkout Session (NO 'customer' field unless it's a cus_ ID) ----
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${from}`,
      allow_promotion_codes: true,
      // Use customer_email for simple flow. DO NOT pass `customer` unless it's a real cus_ id.
      customer_email,
      billing_address_collection: "auto",
      subscription_data: {
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      },
      metadata: { app: "herevna", plan: "pro-monthly", source: from },
    });

    // Return the redirect URL and let the client navigate
    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    // Make Stripe “pattern” issues obvious in logs and response
    console.error("Checkout create error:", err?.type, err?.message, err);
    return NextResponse.json(
      { error: `Checkout error: ${err?.message || "Unknown error"}` },
      { status: 400 }
    );
  }
}