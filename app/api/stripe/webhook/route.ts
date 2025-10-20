import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import prisma from "@/lib/prisma"; // your Prisma client
import type Stripe from "stripe";

export const config = { api: { bodyParser: false } }; // Next.js (app router ignores, but safe)

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret || !sig) {
    return new NextResponse("Missing webhook secret or signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const raw = await req.text();
    event = stripe.webhooks.constructEvent(raw, sig, endpointSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const email = (s.customer_details?.email || s.customer_email || (typeof s.customer === "string" ? s.customer : undefined)) ?? undefined;

        // If you store subscriptions in your DB, you can upsert by customer/email here.
        // Example: mark PRO by role when subscription becomes active (handled again below).
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const cust = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

        // Try to get the customer to retrieve email
        const customer = await stripe.customers.retrieve(cust);
        const email =
          (customer as Stripe.Customer).email ??
          (sub as any).customer_email ??
          undefined;

        if (email) {
          // If active/trialing -> set role PRO, else downgrade
          const isActive = ["active", "trialing"].includes(sub.status);
          await prisma.user.updateMany({
            where: { email },
            data: { role: isActive ? "PRO" : "FREE" },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const cust = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const customer = await stripe.customers.retrieve(cust);
        const email = (customer as any)?.email as string | undefined;

        if (email) {
          await prisma.user.updateMany({
            where: { email },
            data: { role: "FREE" },
          });
        }
        break;
      }

      default:
        // no-op for other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return new NextResponse("Webhook handler error", { status: 500 });
  }
}