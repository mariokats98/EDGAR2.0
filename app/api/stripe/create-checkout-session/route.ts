// app/api/stripe/create-checkout-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export async function POST(req: NextRequest) {
  try {
    const { email, from } = await req.json().catch(() => ({} as any));

    // Figure out our base URL (env first, then request origin)
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      req.headers.get("origin") ||
      "http://localhost:3000";

    // Validate price id
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId || !/^price_/.test(priceId)) {
      return NextResponse.json(
        { error: "Stripe price is not configured." },
        { status: 500 }
      );
    }

    // ⚠️ IMPORTANT: Do NOT send email in `customer`. That expects a 'cus_...' id.
    // Use customer_email to let Stripe handle matching/creating the customer.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${from || ""}`,
      allow_promotion_codes: true,
      // Only use one of these (prefer customer_email for simple flow)
      customer_email: email && typeof email === "string" ? email : undefined,
      // Optional: pass metadata for your app
      metadata: {
        app: "herevna",
        plan: "pro-monthly",
        intent_from: from || "/subscribe",
      },
      // Recommended for email receipts when using customer_email
      billing_address_collection: "auto",
      subscription_data: {
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    // Common Stripe shape-error bubbles up as: "The string did not match the expected pattern."
    console.error("Checkout error:", err?.message || err);
    return NextResponse.json(
      { error: `Checkout error: ${err?.message || "Unknown error"}` },
      { status: 400 }
    );
  }
}