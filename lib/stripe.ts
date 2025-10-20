// lib/stripe.ts
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

// Use the API version your installed stripe types accept.
// If you later bump `stripe` to latest, you can update this string.
export const stripe = new Stripe(key, {
  apiVersion: "2023-10-16",
});