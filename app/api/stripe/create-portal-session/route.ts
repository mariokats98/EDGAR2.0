import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Stripe from "stripe";
import prisma from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const siteUrl = process.env.NEXTAUTH_URL!;
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, stripeCustomerId: true },
    });
    if (!user?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe customer on file" },
        { status: 400 }
      );
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${siteUrl}/account`,
    });

    return NextResponse.redirect(portal.url, { status: 303 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Stripe error", message: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}