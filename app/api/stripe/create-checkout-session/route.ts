import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// ⬇️ Remove apiVersion option
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    const siteUrl = process.env.NEXTAUTH_URL;
    if (!priceId || !siteUrl) {
      return NextResponse.json(
        { error: "Config error", details: ["STRIPE_PRICE_ID", "NEXTAUTH_URL"] },
        { status: 500 }
      );
    }

    let user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) user = await prisma.user.create({ data: { email: session.user.email } });

    let customerId = user.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email ?? undefined });
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/subscribe/success`,
      cancel_url: `${siteUrl}/subscribe`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkout.url });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Stripe error", message: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}