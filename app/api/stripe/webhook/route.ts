import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";
import { Role } from "@prisma/client"; // ✅ use Prisma enum

// App Router route-segment config (supported in Next 13/14)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function updateUserRoleByEmail(email: string, isActive: boolean) {
  // role field is an enum; set it with Prisma's Role enum
  await prisma.user.updateMany({
    where: { email },
    data: { role: isActive ? Role.PRO : Role.FREE }, // ✅ enum, not string
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
    const raw = await req.text(); // raw text body for signature verification
    event = stripe.webhooks.constructEvent(raw, sig, signingSecret);
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

        if (email) {
          await updateUserRoleByEmail(email, true);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const email =
          (sub?.metadata?.userEmail as string | undefined) ||
          (sub?.customer_email as string | undefined) ||
          null;

        const isActive =
          sub.status === "active" ||
          sub.status === "trialing" ||
          sub.status === "past_due";

        if (email) {
          await updateUserRoleByEmail(email, isActive);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const email =
          (sub?.metadata?.userEmail as string | undefined) ||
          (sub?.customer_email as string | undefined) ||
          null;

        if (email) {
          await updateUserRoleByEmail(email, false); // revert to FREE
        }
        break;
      }

      default:
        // no-op for other events
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return NextResponse.json(
      { error: err?.message || "Unhandled webhook error" },
      { status: 500 }
    );
  }
}