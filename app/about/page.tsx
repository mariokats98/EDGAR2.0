// app/about/page.tsx
export default function AboutPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-bold mb-4">About Herevna</h1>
      <p className="text-gray-700 mb-4">
        Herevna makes complex public-market data—like SEC filings, BLS releases, and FRED series—
        easier to explore in clean, fast dashboards designed for research.
      </p>
      <p className="text-gray-700 mb-4">
        Our goal is clarity, speed, and trust. We aggregate official data sources and present them
        in a streamlined way that helps you find what matters quickly.
      </p>
      <p className="text-gray-700">
        We are not a financial advisor and do not provide investment advice. See our{" "}
        <a href="/disclaimer" className="text-blue-600 underline">Data Disclaimer</a>.
      </p>
    </main>
  );
}