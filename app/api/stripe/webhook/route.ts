import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";
import { Role } from "@prisma/client";

// App Router config
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function updateUserRoleByEmail(email: string, isActive: boolean) {
  // Your schema enum is { USER, ADMIN } — map subscription to an existing role.
  // If you want separate tiers later, store them in another field (e.g., subscriptionTier).
  await prisma.user.updateMany({
    where: { email },
    data: { role: isActive ? Role.ADMIN : Role.USER },
  });
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !signingSecret) {
    return NextResponse.json(
      { error: "Missing Stripe webhook configuration" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const rawBody = await req.text(); // required for Stripe verification
    event = stripe.webhooks.constructEvent(rawBody, sig, signingSecret);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err?.message || err}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const email =
          (session.customer_details?.email ||
            (session.customer_email as string | null)) ?? null;

        if (email) await updateUserRoleByEmail(email, true);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const email =
          (sub?.metadata?.userEmail as string | undefined) ||
          (sub as any)?.customer_email ||
          null;

        const isActive =
          sub.status === "active" ||
          sub.status === "trialing" ||
          sub.status === "past_due";

        if (email) await updateUserRoleByEmail(email, isActive);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const email =
          (sub?.metadata?.userEmail as string | undefined) ||
          (sub as any)?.customer_email ||
          null;

        if (email) await updateUserRoleByEmail(email, false);
        break;
      }

      default:
        // ignore other events
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: err?.message || "Unhandled webhook error" },
      { status: 500 }
    );
  }
}