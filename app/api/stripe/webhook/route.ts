import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

// App Router route-segment config (supported in Next 13/14)
// Pin to the Node runtime (Stripe SDK needs Node, not Edge)
export const runtime = "nodejs";
// Make sure this route never gets statically optimized
export const dynamic = "force-dynamic";
// (optional) give the webhook more time if needed on Vercel
export const maxDuration = 60;

export async function POST(req: Request) {
  // Stripe sends a signature header you must verify using the raw body
  const sig = req.headers.get("stripe-signature");
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret || !sig) {
    return new NextResponse("Missing webhook secret or signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const raw = await req.text(); // raw body required for constructEvent
    event = stripe.webhooks.constructEvent(raw, sig, endpointSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err?.message);
    return new NextResponse(`Webhook Error: ${err?.message ?? "invalid signature"}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // no-op; we’ll flip role when subscription is created/updated below
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const custId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

        // get customer email to map to your user
        const customer = await stripe.customers.retrieve(custId);
        const email = (customer as Stripe.Customer).email ?? undefined;

        if (email) {
          const isActive = ["active", "trialing"].includes(sub.status);
          await prisma.user.updateMany({
            where: { email },
            data: { role: isActive ? "PRO" : "FREE" },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const custId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const customer = await stripe.customers.retrieve(custId);
        const email = (customer as Stripe.Customer).email ?? undefined;

        if (email) {
          await prisma.user.updateMany({
            where: { email },
            data: { role: "FREE" },
          });
        }
        break;
      }

      default:
        // ignore other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return new NextResponse("Webhook handler error", { status: 500 });
  }
}