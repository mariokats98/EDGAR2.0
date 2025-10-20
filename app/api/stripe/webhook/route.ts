// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const buf = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  switch (event.type) {
    // After checkout completes: save customer id & set PRO
    case "checkout.session.completed": {
      const cs = event.data.object as Stripe.Checkout.Session;
      const email = cs.customer_details?.email ?? cs.customer_email ?? null;
      const stripeCustomerId =
        typeof cs.customer === "string" ? cs.customer : cs.customer?.id;

      if (email) {
        await prisma.user.update({
          where: { email },
          data: {
            stripeCustomerId,
            role: "PRO",
          },
        });
      }
      break;
    }

    // Subscription (re)activated or created: set PRO
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: customerId },
        select: { email: true },
      });

      if (user?.email) {
        await prisma.user.update({
          where: { email: user.email },
          data: { role: "PRO" },
        });
      }
      break;
    }

    // Subscription ended or payment failed: set FREE
    case "customer.subscription.deleted":
    case "invoice.payment_failed": {
      const obj = event.data.object as any;
      const customerId: string | undefined =
        obj?.customer && typeof obj.customer === "string" ? obj.customer :
        obj?.customer?.id;

      if (customerId) {
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
          select: { email: true },
        });

        if (user?.email) {
          await prisma.user.update({
            where: { email: user.email },
            data: { role: "FREE" },
          });
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}