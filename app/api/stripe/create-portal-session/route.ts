// app/api/stripe/create-portal-session/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";

export async function POST(req: Request) {
  if (!STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  // For a real portal you need the Stripe customer id for the user.
  // Since we’re not storing it yet, return a safe error.
  const { customerId } = await req.json().catch(() => ({ customerId: null }));

  if (!customerId) {
    return NextResponse.json(
      { error: "Missing customer id (not yet stored for users)" },
      { status: 400 }
    );
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: SITE_URL + "/account",
    });

    return NextResponse.json({ url: portal.url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Stripe error" }, { status: 500 });
  }
}