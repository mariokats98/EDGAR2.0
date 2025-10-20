export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions, prisma } from "@/lib/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { from = "/" } = await req.json().catch(() => ({}));

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    // Ensure we have (or create) a Stripe customer linked to the user
    let user = await prisma.user.findUnique({ where: { email: session.user.email } });
    let customerId = user?.stripeCustomerId || undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email!,
        metadata: { userId: user!.id },
      });
      await prisma.user.update({
        where: { id: user!.id },
        data: { stripeCustomerId: customer.id },
      });
      customerId = customer.id;
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${process.env.NEXTAUTH_URL}/subscribe/success?from=${encodeURIComponent(from)}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/subscribe`,
      allow_promotion_codes: true,
      metadata: { userId: user!.id },
    });

    return NextResponse.json({ url: checkout.url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create checkout" }, { status: 500 });
  }
}