// app/terms/page.tsx
export const metadata = {
  title: "Terms of Service — Herevna",
  description:
    "Terms of Service for Herevna.io. Please read these terms before using the site.",
};

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100">
      <section className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
        <p className="text-sm text-gray-600 mb-6">
          Last updated:{" "}
          {new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>

        <div className="space-y-6 text-gray-800 leading-relaxed">
          <p>
            Welcome to Herevna.io (“Herevna”, “we”, “our”). By accessing or using
            the site, you agree to these Terms. If you do not agree, do not use
            the service.
          </p>

          <h2 className="text-lg font-semibold">Use of Service</h2>
          <p>
            Herevna is provided for personal research and educational use. You
            agree not to resell, scrape, or circumvent access controls, and not to
            misuse rate limits or APIs.
          </p>

          <h2 className="text-lg font-semibold">Pro Subscriptions</h2>
          <p>
            Paid features are billed through Stripe on a monthly basis. You can
            cancel anytime via your Stripe receipt or by contacting support. Access
            may end when a billing period expires or payment fails.
          </p>

          <h2 className="text-lg font-semibold">No Financial Advice</h2>
          <p>
            Content is provided for information and entertainment only and does not
            constitute financial, investment, legal, or tax advice. See our{" "}
            <a href="/disclaimer" className="text-blue-600 underline">
              Data Disclaimer
            </a>
            .
          </p>

          <h2 className="text-lg font-semibold">Data & Availability</h2>
          <p>
            We aggregate data from public sources including SEC EDGAR, BLS, and
            FRED. Accuracy and uptime are not guaranteed and may change without
            notice.
          </p>

          <h2 className="text-lg font-semibold">Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, Herevna is not liable for any
            indirect, incidental, special, consequential, or punitive damages, or
            for loss of profits, revenue, or data.
          </p>

          <h2 className="text-lg font-semibold">Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the site
            after updates constitutes acceptance.
          </p>

          <h2 className="text-lg font-semibold">Contact</h2>
          <p>
            Questions? Email{" "}
            <a href="mailto:support@herevna.io" className="text-blue-600 underline">
              support@herevna.io
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}