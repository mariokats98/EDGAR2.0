// app/api/stripe/create-portal-session/route.ts
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

  const siteUrl = process.env.SITE_URL || process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`;
  if (!siteUrl) {
    return NextResponse.json({ error: "Missing SITE_URL" }, { status: 500 });
  }

  const customer = await getOrCreateCustomerByEmail(email);

  const portal = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${siteUrl}/account`,
  });

  return NextResponse.json({ url: portal.url });
}