// Example client snippet in /app/subscribe/page.tsx or wherever the button lives
"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function SubscribeButton() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(""); // optional field if you want to prefill receipts
  const router = useRouter();
  const pathname = usePathname();

  async function goToCheckout() {
    try {
      setLoading(true);
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email || undefined, // omit if blank
          from: pathname || "/subscribe",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create session");

      if (data?.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url as string;
      } else {
        throw new Error("Session URL missing from response");
      }
    } catch (e: any) {
      alert(e.message || "Unable to start checkout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Optional: collect an email; can remove if you don’t want it */}
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full max-w-sm rounded-md border px-3 py-2"
      />
      <button
        onClick={goToCheckout}
        disabled={loading}
        className="rounded-md bg-black px-4 py-2 text-white"
      >
        {loading ? "Starting checkout..." : "Continue to Checkout"}
      </button>
    </div>
  );
}