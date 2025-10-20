import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import prisma from "@/lib/prisma";

export const runtime = "nodejs"; // ensure Node runtime

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Invalid signature", message: err?.message || "Unknown" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        if (cs.customer && cs.customer_email) {
          // store customer id on user
          await prisma.user.update({
            where: { email: cs.customer_email },
            data: { stripeCustomerId: typeof cs.customer === "string" ? cs.customer : cs.customer.id },
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        // mark user pro if active
        const isActive =
          sub.status === "active" ||
          sub.status === "trialing";
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { isPro: isActive },
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { isPro: false },
        });
        break;
      }
      default:
        // ignore other events
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Webhook handler error", message: err?.message || "Unknown" },
      { status: 500 }
    );
  }
}