// app/api/stripe/create-checkout-session/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions, prisma } from "@/lib/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2023-10-16" });

function validateEnv() {
  const errs: string[] = [];
  const secret = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_ID;
  const site = process.env.NEXTAUTH_URL;

  if (!secret) errs.push("STRIPE_SECRET_KEY missing");
  if (!price) errs.push("STRIPE_PRICE_ID missing");
  if (price && !/^price_[A-Za-z0-9]+$/.test(price)) errs.push("STRIPE_PRICE_ID must look like price_XXXX");
  if (!site) errs.push("NEXTAUTH_URL missing");
  if (site && !/^https?:\/\/[^ ]+$/.test(site)) errs.push("NEXTAUTH_URL must be a full https URL");
  return errs;
}

export async function POST(req: NextRequest) {
  try {
    const envIssues = validateEnv();
    if (envIssues.length) {
      return NextResponse.json({ error: "Config error", details: envIssues }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    const { from = "/" } = await req.json().catch(() => ({}));
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    // Ensure user + stripe customer
    let user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) user = await prisma.user.create({ data: { email: session.user.email } });

    let customerId = user.stripeCustomerId || undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email!,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    const site = process.env.NEXTAUTH_URL!;
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      allow_promotion_codes: true,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${site}/subscribe/success?from=${encodeURIComponent(from)}`,
      cancel_url: `${site}/subscribe`,
      metadata: { userId: user.id },
    });

    return NextResponse.json({ url: checkout.url });
  } catch (e: any) {
    // Surface Stripe’s exact message so we know which field failed validation
    return NextResponse.json(
      { error: "Stripe error", message: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}