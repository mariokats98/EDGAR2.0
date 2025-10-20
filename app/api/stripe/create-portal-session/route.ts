import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find (or create) the customer by email
    const existing = await stripe.customers.list({
      email: session.user.email,
      limit: 1,
    });

    const customer = existing.data[0] ?? await stripe.customers.create({
      email: session.user.email,
      name: session.user.name ?? undefined,
    });

    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/account`,
    });

    return NextResponse.json({ url: portal.url });
  } catch (err: any) {
    console.error("create-portal-session error:", err);
    return NextResponse.json({ error: err.message ?? "Stripe error" }, { status: 500 });
  }
}