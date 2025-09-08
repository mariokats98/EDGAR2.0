// app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Hero / intro */}
      <section className="bg-gradient-to-r from-brand via-brand-blue to-brand-pink text-white">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Herevna.io — Financial & Economic Data, Simplified
          </h1>
          <p className="mt-2 text-white/85 max-w-2xl">
            Your professional hub for SEC EDGAR filings, BLS economic series, and FRED interest-rate benchmarks — in one place.
          </p>
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-4 md:grid-cols-3">
          {/* EDGAR */}
          <FeatureCard
            title="Explore EDGAR"
            description="Search filings by ticker or company, filter by form type, date range, and more."
            href="/edgar"
            cta="Open EDGAR"
          />
          {/* BLS */}
          <FeatureCard
            title="Explore BLS"
            description="Browse key labor and price indicators with clear summaries and charts."
            href="/bls"
            cta="Open BLS"
          />
          {/* NEW: FRED */}
          <FeatureCard
            title="Explore FRED"
            description="Track interest rates and benchmark series. Use presets, search by name, and visualize trends."
            href="/fred"
            cta="Open FRED"
          />
        </div>

        {/* Secondary actions / quick links (optional) */}
        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <a
            href="/news"
            className="rounded-full border px-4 py-2 hover:bg-gray-50"
          >
            Market News
          </a>
          <a
            href="/screener"
            className="rounded-full border px-4 py-2 hover:bg-gray-50"
          >
            Stock Screener
          </a>
        </div>

        {/* Footer note */}
        <p className="mt-12 text-xs text-gray-500">
          This site republishes SEC EDGAR filings and BLS/FRED data. © Herevna.io
        </p>
      </section>
    </main>
  );
}

function FeatureCard({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow transition">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-md bg-black text-white px-4 py-2 text-sm hover:opacity-90"
      >
        {cta}
        <svg
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M10.293 3.293a1 1 0 011.414 0l5 5a.997.997 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L13.586 11H4a1 1 0 110-2h9.586l-3.293-3.293a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </Link>
    </div>
  );
}
