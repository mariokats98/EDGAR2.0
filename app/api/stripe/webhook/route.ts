// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });

export async function POST(req: NextRequest) {
  // In the App Router, req.text() returns the raw body (no body parser to disable)
  const sig = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = cs.subscription as string | null;
        const customerId = cs.customer as string | null;

        // Find user via metadata.userId, stripeCustomerId, or email fallback
        let user = cs.metadata?.userId
          ? await prisma.user.findUnique({ where: { id: cs.metadata.userId } })
          : null;

        if (!user && customerId) {
          user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        }
        if (!user && cs.customer_details?.email) {
          user = await prisma.user.findUnique({ where: { email: cs.customer_details.email } });
        }
        if (!user) break;

        // Flip Pro on and upsert subscription record
        await prisma.user.update({
          where: { id: user.id },
          data: { isPro: true, stripeCustomerId: customerId ?? user.stripeCustomerId ?? undefined },
        });

        if (subscriptionId) {
          await prisma.subscription.upsert({
            where: { stripeSubId: subscriptionId },
            create: {
              stripeSubId: subscriptionId,
              stripePriceId:
                (cs as any)?.line_items?.data?.[0]?.price?.id || process.env.STRIPE_PRICE_ID || "",
              status: "active",
              userId: user.id,
            },
            update: {
              status: "active",
              stripePriceId:
                (cs as any)?.line_items?.data?.[0]?.price?.id || process.env.STRIPE_PRICE_ID || "",
            },
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
        if (!user) break;

        const active = ["active", "trialing", "past_due"].includes(sub.status);
        await prisma.user.update({ where: { id: user.id }, data: { isPro: active } });

        await prisma.subscription.upsert({
          where: { stripeSubId: sub.id },
          create: {
            stripeSubId: sub.id,
            stripePriceId: sub.items.data[0]?.price.id || "",
            status: sub.status,
            currentPeriodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null,
            userId: user.id,
          },
          update: {
            status: sub.status,
            stripePriceId: sub.items.data[0]?.price.id || "",
            currentPeriodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null,
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

// ❌ Do NOT include: export const config = { api: { bodyParser: false } };
// That’s for the Pages Router and causes the “Page config … is deprecated” build error.