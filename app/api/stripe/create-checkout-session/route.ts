// app/api/stripe/create-checkout-session/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // find or create StripeCustomer mapping
  let sc = await prisma.stripeCustomer.findFirst({
    where: { user: { email } },
    select: { id: true, customerId: true, user: { select: { id: true } } }
  });

  let customerId = sc?.customerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email });
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    await prisma.stripeCustomer.create({
      data: { userId: user.id, customerId: customer.id }
    });
    customerId = customer.id;
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    success_url: `${process.env.SITE_URL ?? "https://herevna.io"}/subscribe/success`,
    cancel_url: `${process.env.SITE_URL ?? "https://herevna.io"}/pricing`,
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID!, // set in Vercel
        quantity: 1
      }
    ],
    allow_promotion_codes: true
  });

  return NextResponse.redirect(checkout.url!, { status: 303 });
}