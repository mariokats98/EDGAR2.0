"use client";

export default function DisclaimerPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100">
      {/* background accents */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600/10 to-indigo-600/10 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[-6rem] h-80 w-80 rounded-full bg-gradient-to-tr from-emerald-400/10 to-cyan-500/10 blur-3xl" />
      </div>

      <section className="mx-auto max-w-4xl px-4 py-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
          Data Disclaimer
        </h1>

        <p className="text-gray-600 text-sm mb-6">
          Last updated: {new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>

        <div className="space-y-6 text-gray-700 leading-relaxed text-sm sm:text-base">
          <p>
            Herevna.io (“Herevna”, “we”, “our”, or “us”) republishes and
            aggregates public market data from sources such as the U.S.
            Securities and Exchange Commission (EDGAR), the Bureau of Labor
            Statistics (BLS), and the Federal Reserve Economic Data (FRED). All
            information presented on this website is provided solely for
            informational and educational purposes.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">
            No Financial or Investment Advice
          </h2>
          <p>
            The information made available through Herevna does not constitute
            financial, investment, legal, or tax advice. None of the material on
            this site should be interpreted as a recommendation to buy, sell, or
            hold any security, asset, or financial instrument. Users should
            always perform their own due diligence and, if necessary, consult
            with a licensed financial advisor before making investment
            decisions.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">
            Data Accuracy and Timeliness
          </h2>
          <p>
            While we make every effort to ensure data accuracy and reliability,
            Herevna does not guarantee the completeness, accuracy, or
            timeliness of the data displayed. All data is provided “as is” and
            may include delays, omissions, or errors. Historical data may be
            subject to revision by the original source agencies.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">
            Liability Disclaimer
          </h2>
          <p>
            Under no circumstances shall Herevna, its owners, or affiliates be
            liable for any direct, indirect, incidental, consequential, or
            special damages arising out of or in connection with the use of the
            information provided on this site. Use of the site is at your own
            risk.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">
            Third-Party Data Sources
          </h2>
          <p>
            Herevna relies on publicly available APIs and filings from official
            agencies and market data providers. We do not claim ownership of the
            underlying data. Trademarks, names, and logos are the property of
            their respective owners.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">
            Use of Premium Features
          </h2>
          <p>
            Premium (“Pro”) subscriptions provide enhanced data access,
            dashboards, and analytics. These tools are designed for personal
            research and educational purposes only. Commercial use or
            redistribution without authorization is prohibited.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">
            Contact
          </h2>
          <p>
            For questions or support inquiries, please contact us at{" "}
            <a
              href="mailto:support@herevna.io"
              className="text-blue-600 hover:underline"
            >
              support@herevna.io
            </a>
            .
          </p>

          <p className="pt-4 text-sm text-gray-500">
            © {new Date().getFullYear()} Herevna.io — All rights reserved.
          </p>
        </div>
      </section>
    </main>
  );
}