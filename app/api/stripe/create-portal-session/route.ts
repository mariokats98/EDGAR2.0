// app/api/stripe/create-portal-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
// ^ deliberately omit apiVersion to avoid type mismatch errors during builds

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Look up (or create) the Stripe customer by email — no DB field needed
  let customerId: string | undefined;

  const list = await stripe.customers.list({ email, limit: 1 });
  if (list.data.length > 0) {
    customerId = list.data[0].id;
  } else {
    const created = await stripe.customers.create({ email });
    customerId = created.id;
  }

  const siteUrl =
    process.env.SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId!,
    return_url: `${siteUrl}/account`,
  });

  // Redirect the user to Stripe’s billing portal
  return NextResponse.redirect(portal.url, { status: 303 });
}