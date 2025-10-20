// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const cs = event.data.object as Stripe.Checkout.Session;
      const email = cs.customer_details?.email || cs.customer_email || undefined;
      if (email) {
        await prisma.user.update({
          where: { email },
          data: { role: "PRO" }
        });

        // ensure mapping exists
        if (cs.customer) {
          const customerId = typeof cs.customer === "string" ? cs.customer : cs.customer.id;
          const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
          if (user) {
            await prisma.stripeCustomer.upsert({
              where: { userId: user.id },
              update: { customerId },
              create: { userId: user.id, customerId }
            });
          }
        }
      }
      break;
    }
    case "customer.subscription.deleted":
    case "invoice.payment_failed": {
      // downgrade by email if possible
      const obj: any = event.data.object;
      let email: string | undefined;
      if ("customer_email" in obj && obj.customer_email) email = obj.customer_email as string;

      if (!email && "customer" in obj && obj.customer) {
        const customerId = obj.customer as string;
        const sc = await prisma.stripeCustomer.findFirst({
          where: { customerId },
          select: { user: { select: { email: true } } }
        });
        email = sc?.user?.email;
      }

      if (email) {
        await prisma.user.update({
          where: { email },
          data: { role: "FREE" }
        });
      }
      break;
    }
    default:
      // ignore other events
      break;
  }

  return NextResponse.json({ received: true }, { status: 200 });
}