import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

// ⬇️ Remove apiVersion option
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

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
          await prisma.user.update({
            where: { email: cs.customer_email },
            data: {
              stripeCustomerId:
                typeof cs.customer === "string" ? cs.customer : cs.customer.id,
            },
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const isActive = sub.status === "active" || sub.status === "trialing";
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