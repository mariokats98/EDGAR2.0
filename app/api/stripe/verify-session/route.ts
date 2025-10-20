// app/api/stripe/verify-session/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";

export async function GET(req: Request) {
  if (!STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("session_id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  try {
    const sess = await stripe.checkout.sessions.retrieve(id);
    return NextResponse.json({ ok: true, status: sess.status, session: sess });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}