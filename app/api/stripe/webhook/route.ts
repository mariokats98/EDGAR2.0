// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing Stripe webhook config" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  // Helper to locate an email on various events
  const extractEmail = (): string | null => {
    // Several objects include customer_email
    const obj: any = event.data?.object ?? {};
    if (obj.customer_email) return obj.customer_email;
    if (obj.customer_details?.email) return obj.customer_details.email;
    if (obj.client_reference_id) return obj.client_reference_id; // we set this to email in checkout
    return null;
  };

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "invoice.payment_succeeded": {
        const email = extractEmail();
        if (email) {
          await prisma.user.update({
            where: { email },
            data: { role: "PRO" },
          }).catch(() => Promise.resolve()); // ignore if no user yet
        }
        break;
      }

      case "customer.subscription.deleted":
      case "invoice.payment_failed": {
        const email = extractEmail();
        if (email) {
          await prisma.user.update({
            where: { email },
            data: { role: "FREE" },
          }).catch(() => Promise.resolve());
        }
        break;
      }

      default:
        // Ignore other events
        break;
    }
  } catch (e: any) {
    // Don’t fail the webhook: acknowledge receipt so Stripe doesn’t retry forever
    return NextResponse.json({ received: true, note: e.message ?? "handled" }, { status: 200 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}