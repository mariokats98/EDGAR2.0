"use client";
import * as React from "react";

async function startCheckout(from: string) {
  const res = await fetch("/api/stripe/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.details?.join?.(", ") || data?.message || data?.error || "Failed");
  window.location.href = data.url;
}

export default function SubscribePage() {
  const [loading, setLoading] = React.useState(false);
  return (
    <main className="mx-auto max-w-3xl px-4 py-14">
      <div className="rounded-2xl border bg-white p-6 md:p-8">
        <h1 className="text-3xl font-bold">Go Pro — $9.99/mo</h1>
        <p className="mt-2 text-gray-600">
          Unlock BLS & FRED dashboards, Screener, faster refresh, and more. Built for research speed and clarity.
        </p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          <li className="rounded-lg border p-3">BLS & FRED dashboards</li>
          <li className="rounded-lg border p-3">Advanced Screener</li>
          <li className="rounded-lg border p-3">Cleaner, faster data flows</li>
          <li className="rounded-lg border p-3">Priority enhancements</li>
        </ul>

        <div className="mt-8 flex items-center gap-3">
          <button
            onClick={async () => {
              try {
                setLoading(true);
                await startCheckout("/");
              } catch (e: any) {
                alert(`Checkout error: ${e.message}`);
              } finally {
                setLoading(false);
              }
            }}
            className="rounded-full bg-black text-white px-5 py-2.5 text-sm hover:opacity-90 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Preparing…" : "Continue to Checkout"}
          </button>
          <a href="/pricing" className="text-sm text-gray-600 hover:underline">
            See details
          </a>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          By subscribing, you agree to our <a className="underline" href="/terms">Terms of Service</a> and <a className="underline" href="/disclaimer">Data Disclaimer</a>.
        </p>
      </div>
    </main>
  );
}