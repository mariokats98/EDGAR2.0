import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = cs.subscription as string;
        const priceId = (cs.line_items?.data?.[0]?.price?.id) || process.env.STRIPE_PRICE_ID!;
        const customerId = cs.customer as string;

        // Find user: prefer metadata.userId, else by stripeCustomerId
        let user = null;
        if (cs.metadata?.userId) {
          user = await prisma.user.findUnique({ where: { id: cs.metadata.userId } });
        }
        if (!user && customerId) {
          user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        }
        if (!user && cs.customer_details?.email) {
          user = await prisma.user.findUnique({ where: { email: cs.customer_details.email } });
        }
        if (!user) break;

        // Upsert subscription and flip Pro on
        await prisma.user.update({ where: { id: user.id }, data: { isPro: true, stripeCustomerId: customerId } });
        await prisma.subscription.upsert({
          where: { stripeSubId: subscriptionId },
          create: {
            stripeSubId: subscriptionId,
            stripePriceId: priceId,
            status: "active",
            userId: user.id,
          },
          update: {
            status: "active",
            stripePriceId: priceId,
          },
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const status = sub.status;

        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (!user) break;

        const active = status === "active" || status === "trialing" || status === "past_due";
        await prisma.user.update({ where: { id: user.id }, data: { isPro: active } });

        await prisma.subscription.upsert({
          where: { stripeSubId: sub.id },
          create: {
            stripeSubId: sub.id,
            stripePriceId: sub.items.data[0]?.price.id || "",
            status,
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
            userId: user.id,
          },
          update: {
            status,
            stripePriceId: sub.items.data[0]?.price.id || "",
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
          },
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const config = {
  api: { bodyParser: false }, // ensure raw body for stripe
};