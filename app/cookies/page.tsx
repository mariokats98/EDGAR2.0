// app/cookies/page.tsx
export const metadata = {
  title: "Cookie Policy — Herevna",
  description:
    "Cookie Policy for Herevna.io explaining how cookies and similar technologies are used for functionality, analytics, and user experience.",
};

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100">
      <section className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold mb-4">Cookie Policy</h1>
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
            This Cookie Policy explains how <strong>Herevna.io</strong> ("we," "our," or "us") uses cookies and similar technologies 
            when you visit or use our website and services. It should be read together with our{" "}
            <a href="/terms" className="text-blue-600 underline">Terms of Service</a> and{" "}
            <a href="/privacy" className="text-blue-600 underline">Privacy Policy</a>.
          </p>

          <h2 className="text-lg font-semibold">What Are Cookies?</h2>
          <p>
            Cookies are small text files stored on your device when you visit a website. 
            They help the site remember your preferences, improve performance, and deliver 
            a better user experience.
          </p>

          <h2 className="text-lg font-semibold">How We Use Cookies</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong>Essential Cookies:</strong> Required for the website to function, 
              including security and session management.
            </li>
            <li>
              <strong>Analytics Cookies:</strong> Help us understand how visitors use Herevna, 
              such as which pages are most popular, so we can improve performance and usability.
            </li>
            <li>
              <strong>Preference Cookies:</strong> Store user settings such as theme or 
              interface preferences for a more personalized experience.
            </li>
            <li>
              <strong>Third-Party Cookies:</strong> Services such as Vercel Analytics or 
              Stripe may place their own cookies to support metrics or payments.
            </li>
          </ul>

          <h2 className="text-lg font-semibold">Your Choices</h2>
          <p>
            You can manage or disable cookies through your browser settings. 
            However, disabling essential cookies may limit functionality on our site.
          </p>

          <h2 className="text-lg font-semibold">Third-Party Services</h2>
          <p>
            Herevna may integrate trusted analytics and payment partners (like Stripe and 
            Vercel Analytics). These partners may use cookies or similar tracking technologies 
            as described in their own privacy policies.
          </p>

          <h2 className="text-lg font-semibold">Updates to This Policy</h2>
          <p>
            We may update this Cookie Policy periodically to reflect changes in our practices 
            or for operational, legal, or regulatory reasons. The “Last updated” date above 
            indicates the latest revision.
          </p>

          <h2 className="text-lg font-semibold">Contact</h2>
          <p>
            If you have questions about our Cookie Policy, please contact us at{" "}
            <a href="mailto:support@herevna.io" className="text-blue-600 underline">
              support@herevna.io
            </a>.
          </p>
        </div>
      </section>
    </main>
  );
}