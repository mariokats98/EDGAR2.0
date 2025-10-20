// app/api/stripe/create-checkout-session/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe, getOrCreateCustomerByEmail } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  const siteUrl = process.env.SITE_URL || process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`;
  if (!priceId || !siteUrl) {
    return NextResponse.json({ error: "Missing STRIPE_PRICE_ID or SITE_URL" }, { status: 500 });
  }

  const customer = await getOrCreateCustomerByEmail(email);

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    client_reference_id: email, // we’ll use this in webhook as a fallback
    success_url: `${siteUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/pricing`,
  });

  return NextResponse.json({ url: checkout.url });
}