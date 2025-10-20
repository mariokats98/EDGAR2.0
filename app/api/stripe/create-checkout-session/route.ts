import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";

const PRICE_ID = process.env.STRIPE_PRICE_ID; // e.g. price_123

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!PRICE_ID) {
    return NextResponse.json({ error: "Missing STRIPE_PRICE_ID" }, { status: 500 });
  }

  try {
    // Reuse customer if one exists; otherwise create by email
    const existing = await stripe.customers.list({
      email: session.user.email,
      limit: 1,
    });
    const customerId = existing.data[0]?.id ?? (await stripe.customers.create({
      email: session.user.email,
      name: session.user.name ?? undefined,
    })).id;

    const checkout = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/account?status=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/account?status=cancel`,
      metadata: {
        userEmail: session.user.email,
      },
    });

    return NextResponse.json({ url: checkout.url });
  } catch (err: any) {
    console.error("create-checkout-session error:", err);
    return NextResponse.json({ error: err.message ?? "Stripe error" }, { status: 500 });
  }
}