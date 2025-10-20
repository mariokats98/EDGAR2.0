// lib/stripe.ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

/**
 * Find or create a Stripe Customer by email.
 */
export async function getOrCreateCustomerByEmail(email: string) {
  // Try to find an existing customer with this email
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data.length > 0) return existing.data[0];

  // Create new if not found
  return await stripe.customers.create({ email });
}