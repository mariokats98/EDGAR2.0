// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma"; // adjust import if your prisma instance path differs

export const runtime = "nodejs";         // need Node runtime for raw body + crypto
export const dynamic = "force-dynamic";  // webhooks must not be statically rendered

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
// ^ omit apiVersion to avoid type mismatches during deploys

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing Stripe signature or webhook secret" }, { status: 400 });
  }

  // IMPORTANT: get the raw body text for signature verification
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        const email = cs.customer_details?.email || cs.customer_email || cs.metadata?.email;

        if (email) {
          // Mark user PRO; create user if they don’t exist yet
          await prisma.user.upsert({
            where: { email },
            update: { role: "PRO" },
            create: { email, role: "PRO" },
          });
        }
        break;
      }

      case "customer.subscription.deleted":
      case "customer.subscription.canceled":
      case "invoice.payment_failed": {
        // Try to get an email to downgrade the user
        const obj: any = event.data.object;
        const email =
          obj?.customer_email || obj?.customer_details?.email || obj?.metadata?.email;

        if (email) {
          await prisma.user.updateMany({
            where: { email },
            data: { role: "FREE" },
          });
        }
        break;
      }

      // You can add other events as needed, but no stripeCustomerId usage
      default:
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    // Don’t let errors crash the function—return 200 so Stripe doesn’t retry forever,
    // but log the failure in your own logging if you have it.
    return NextResponse.json({ error: err.message ?? "Webhook handler error" }, { status: 200 });
  }
}