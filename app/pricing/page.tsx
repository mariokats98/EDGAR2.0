// app/pricing/page.tsx
export default function PricingPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-bold mb-4">Pricing</h1>
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-4xl font-extrabold">$9.99<span className="text-base font-medium">/mo</span></div>
        <p className="mt-2 text-gray-700">
          Unlock premium dashboards, faster refresh, and enhanced tools.
        </p>
        <ul className="mt-4 list-disc list-inside text-gray-700 space-y-1">
          <li>BLS Macro Dashboard</li>
          <li>FRED Benchmarks</li>
          <li>EDGAR Deep Search</li>
          <li>Stock Screener and Congress Trades</li>
        </ul>
        <a
          href="/subscribe"
          className="inline-block mt-6 rounded-lg bg-black text-white px-5 py-2 text-sm hover:opacity-90"
        >
          Subscribe with Stripe
        </a>
        <p className="mt-3 text-xs text-gray-500">
          Prices in USD. Taxes/fees may apply. Cancel anytime via Stripe receipt or by contacting support.
        </p>
      </div>
    </main>
  );
}