"use client";

import * as React from "react";

/** Reads simple 'isPro=1' cookie to show a friendly banner if already subscribed */
function useIsProFromCookie() {
  const [isPro, setIsPro] = React.useState(false);
  React.useEffect(() => {
    try {
      const m = document.cookie.match(/(?:^|;\s*)isPro=([^;]+)/);
      setIsPro(m?.[1] === "1");
    } catch {}
  }, []);
  return isPro;
}

export default function SubscribePage() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isPro = useIsProFromCookie();

  const from =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("from") || "/"
      : "/";

  async function onSubscribe() {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from }),
      });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
      } else {
        setError(json?.error || "Could not start checkout. Please try again.");
      }
    } catch (e: any) {
      setError(e?.message || "Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100">
      {/* soft background accents */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-600/10 to-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-32 right-[-6rem] h-80 w-80 rounded-full bg-gradient-to-tr from-emerald-400/10 to-cyan-500/10 blur-3xl" />
      </div>

      {/* Header */}
      <section className="mx-auto max-w-6xl px-4 pt-12">
        {isPro && (
          <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm text-emerald-700">
            You already have <strong>Herevna Pro</strong>. Enjoy full access!
          </div>
        )}

        <div className="text-center">
          <h1 className="mt-2 text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900">
            Unlock <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-blue-500">Herevna Pro</span>
          </h1>
          <p className="mt-3 text-gray-600 max-w-2xl mx-auto">
            Faster data. Clearer insights. Premium dashboards for EDGAR, BLS, FRED, and market screening — all in one place.
          </p>
        </div>
      </section>

      {/* Pricing + Feature highlights */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: Value card */}
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl sm:text-4xl font-extrabold text-gray-900">
                  $9.99<span className="text-base font-medium text-gray-600">/mo</span>
                </div>
                <p className="mt-1 text-gray-600 text-sm">Full access to premium dashboards & faster refresh.</p>
              </div>
            </div>

            <ul className="mt-6 space-y-3 text-sm text-gray-800">
              {[
                "BLS Macro Dashboard — CPI, payrolls, unemployment trends",
                "FRED Benchmarks — rates, yield curves, macro indicators",
                "EDGAR Deep Search — filings, filters, clean summaries",
                "Stock Screener — volume, momentum, market cap filters",
                "Congressional Trading — track recent disclosures",
                "Faster refresh, cleaner UI, no clutter",
                "Email support and ongoing feature updates",
              ].map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <svg className="h-5 w-5 text-indigo-600 mt-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M9 16.2l-3.5-3.6L4 14l5 5 11-11-1.5-1.5z" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-lg bg-indigo-50 border border-indigo-100 p-4 text-xs text-indigo-900">
              <strong>Fair use:</strong> personal research only. Data is provided “as is” and does not constitute financial advice.
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-stretch gap-3">
              <button
                onClick={onSubscribe}
                disabled={loading}
                className="h-12 flex-1 rounded-lg bg-black text-white text-sm font-medium hover:opacity-90 transition"
              >
                {loading ? "Redirecting to Stripe…" : "Subscribe — $9.99 / month"}
              </button>
              <a
                href="/"
                className="h-12 flex-1 rounded-lg border bg-white text-gray-900 text-sm font-medium grid place-items-center hover:bg-gray-50 transition"
              >
                Explore free features
              </a>
            </div>

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

            <p className="mt-3 text-[11px] text-gray-500">
              By subscribing, you agree to our <a href="/disclaimer" className="underline hover:no-underline">Data Disclaimer</a>.
              You can cancel anytime from your Stripe receipt or by contacting support.
            </p>
          </div>

          {/* Right: Persuasion panel */}
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Why Herevna Pro?</h3>
            <p className="mt-2 text-sm text-gray-700">
              We strip away noise so you can focus on what matters. Pro brings faster updates,
              deeper filters, and a smoother research workflow — all in one place.
            </p>

            {/* Mini comparison */}
            <div className="mt-6">
              <div className="grid grid-cols-2 text-xs font-medium text-gray-600">
                <div>Free</div>
                <div className="text-right">Pro</div>
              </div>
              <div className="mt-2 space-y-2 text-sm">
                {[
                  ["Basic access", "Full dashboards"],
                  ["Standard refresh", "Faster refresh"],
                  ["Limited filtering", "Advanced filters"],
                  ["No screener", "Stock Screener"],
                  ["No Congress tab", "Congress Trades"],
                ].map(([free, pro]) => (
                  <div key={free} className="grid grid-cols-2 items-center">
                    <div className="text-gray-600">{free}</div>
                    <div className="text-right text-gray-900 font-medium">{pro}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Testimonials (placeholder copy you can tune) */}
            <div className="mt-8">
              <h4 className="text-sm font-semibold text-gray-900">What users say</h4>
              <div className="mt-3 grid gap-3">
                {[
                  { q: "Faster to the point than other tools.", a: "Cuts the time I spend hunting for data." },
                  { q: "Clean, focused dashboards.", a: "I get clarity without the fluff or ads." },
                  { q: "Everything I need in one place.", a: "Filings, macro, screeners — it’s all here." },
                ].map((t, i) => (
                  <blockquote key={i} className="rounded-lg border bg-slate-50 p-3">
                    <p className="text-sm text-gray-800">“{t.q}”</p>
                    <p className="mt-1 text-xs text-gray-600">— {t.a}</p>
                  </blockquote>
                ))}
              </div>
            </div>

            {/* FAQs */}
            <div className="mt-8">
              <h4 className="text-sm font-semibold text-gray-900">FAQs</h4>
              <div className="mt-3 space-y-3">
                <Faq q="Can I cancel anytime?">
                  Yes — it’s a monthly plan with no lock-in. Manage via your Stripe receipt or contact support.
                </Faq>
                <Faq q="Is this financial advice?">
                  No. Herevna is for information and entertainment only and does not provide investment advice.
                </Faq>
                <Faq q="Will Pro speed up the site?">
                  Pro includes faster refresh windows and access to additional endpoints.
                </Faq>
                <Faq q="Do you store payment info?">
                  No — checkout is handled securely by Stripe.
                </Faq>
              </div>
            </div>

            {/* Risk reversal */}
            <div className="mt-8 rounded-lg border bg-indigo-50 p-4 text-sm text-indigo-900">
              Not sure yet? Try it for a month. If it doesn’t help your workflow, you can cancel anytime.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/* ---------- Small components ---------- */

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-lg border bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
      >
        <span className="font-medium text-gray-900">{q}</span>
        <svg
          className={`h-4 w-4 text-gray-500 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5.25 7.5l4.5 4 4.5-4" />
        </svg>
      </button>
      {open && <div className="px-3 pb-3 text-sm text-gray-700">{children}</div>}
    </div>
  );
}