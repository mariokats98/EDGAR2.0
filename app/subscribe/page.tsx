"use client";
import * as React from "react";

export default function SubscribePage() {
  const [loading, setLoading] = React.useState(false);
  const onSubscribe = async () => {
    try {
      setLoading(true);
      const from = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("from") || "/"
        : "/";
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from }),
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else alert(json.error || "Failed to start checkout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Unlock Pro — $9.99 / month</h1>
      <p className="text-gray-600 mb-6">
        Get full access to BLS Dashboard, FRED Benchmarks, Stock Screener, Congress Tracker, and more.
      </p>
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="text-4xl font-extrabold mb-1">$9.99<span className="text-base font-medium">/mo</span></div>
        <ul className="text-gray-700 list-disc list-inside mb-6">
          <li>All premium dashboards</li>
          <li>Faster refresh & endpoints</li>
          <li>Cancel anytime</li>
        </ul>
        <button
          onClick={onSubscribe}
          disabled={loading}
          className="h-11 rounded-lg bg-black text-white px-5 text-sm"
        >
          {loading ? "Redirecting…" : "Subscribe with Stripe"}
        </button>
      </div>
    </main>
  );
}