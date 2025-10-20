// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing Stripe signature or webhook secret" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  const downgradeByEmail = async (email?: string | null) => {
    if (!email) return;
    await prisma.user.updateMany({ where: { email }, data: { role: "FREE" } });
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        const email = cs.customer_details?.email || cs.customer_email || cs.metadata?.email;
        if (email) {
          await prisma.user.upsert({
            where: { email },
            update: { role: "PRO" },
            create: { email, role: "PRO" },
          });
        }
        break;
      }

      // Subscription status changed (e.g. canceled, past_due, unpaid)
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const email =
          (sub as any)?.customer_email || sub?.metadata?.email; // customer_email is present if you include it; metadata is a good fallback
        const badStatuses: Stripe.Subscription.Status[] = ["canceled", "past_due", "unpaid", "incomplete_expired"];
        if (badStatuses.includes(sub.status)) {
          await downgradeByEmail(email);
        }
        break;
      }

      // Subscription removed entirely
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const email =
          (sub as any)?.customer_email || sub?.metadata?.email;
        await downgradeByEmail(email);
        break;
      }

      // Payment failed — often a temporary downgrade
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const email =
          invoice.customer_email || invoice.customer?.toString() || invoice.account_name || invoice.metadata?.email;
        await downgradeByEmail(email);
        break;
      }

      default:
        // No-op for other events
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    // Return 200 so Stripe doesn’t retry forever; log in your own system if needed.
    return NextResponse.json({ error: err.message ?? "Webhook handler error" }, { status: 200 });
  }
}