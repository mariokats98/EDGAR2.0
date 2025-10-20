// app/api/stripe/webhook/route.ts
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

export const runtime = "nodejs"; // required for webhooks

export async function POST(req: Request) {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Stripe webhook not configured" },
      { status: 500 }
    );
  }

  const buf = await req.arrayBuffer();
  const sig = (await headers()).get("stripe-signature") ?? "";

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      Buffer.from(buf),
      sig,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Handle only the basics, safely (no DB)
  switch (event.type) {
    case "checkout.session.completed":
      // You can read event.data.object here and later store customer id
      break;
    case "customer.subscription.deleted":
    case "invoice.payment_failed":
      // Downgrade logic would go here once you store subscription/customer ids.
      break;
    default:
      // noop
      break;
  }

  return NextResponse.json({ received: true });
}