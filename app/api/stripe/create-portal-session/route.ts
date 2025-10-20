// app/api/stripe/create-portal-session/route.ts
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

  const sc = await prisma.stripeCustomer.findFirst({
    where: { user: { email } },
    select: { customerId: true }
  });
  if (!sc?.customerId) {
    return NextResponse.json({ error: "No Stripe customer on file" }, { status: 400 });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: sc.customerId,
    return_url: `${process.env.SITE_URL ?? "https://herevna.io"}/account`
  });

  return NextResponse.redirect(portal.url, { status: 303 });
}