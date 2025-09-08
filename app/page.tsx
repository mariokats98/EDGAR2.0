// app/page.tsx
"use client";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900">
          Simplifying <span className="text-blue-600">Economic</span>, <span className="text-emerald-600">Market</span> &amp;  <span className="text-red-600">Regulatory</span> Data
        </h1>
        <p className="mt-3 text-gray-600 max-w-2xl mx-auto">
          Your one place to search filings, explore economic data, and scan market insights.
        </p>

        {/* Quick actions */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href="/edgar"
            className="inline-flex items-center gap-2 rounded-full bg-black text-white px-5 py-2.5 text-sm hover:opacity-90"
          >
            Explore EDGAR
          </a>
          <a
            href="/bls"
            className="inline-flex items-center gap-2 rounded-full bg-white text-gray-900 border px-5 py-2.5 text-sm hover:bg-gray-50"
          >
            Explore BLS
          </a>
          <a
            href="/screener"
            className="inline-flex items-center gap-2 rounded-full bg-white text-gray-900 border px-5 py-2.5 text-sm hover:bg-gray-50"
          >
            Explore Screener
          </a>
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-5 md:grid-cols-3">
          {/* EDGAR */}
          <a
            href="/edgar"
            className="group block rounded-2xl border bg-white p-5 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">EDGAR Filings</h3>
              <span className="text-xs rounded-full bg-gray-100 px-2 py-1 text-gray-700">SEC</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Search 8-K, 10-Q, 10-K, S-1, 13D/G, 6-K and more. Filter by dates, form types, and reporting persons.
            </p>
            <div className="mt-4 text-sm text-blue-600 group-hover:underline">Open EDGAR →</div>
          </a>

          {/* BLS */}
          <a
            href="/bls"
            className="group block rounded-2xl border bg-white p-5 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">BLS Dashboard</h3>
              <span className="text-xs rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Economy</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Track CPI, Unemployment, Payrolls and more. View latest prints, trends, and release calendars.
            </p>
            <div className="mt-4 text-sm text-blue-600 group-hover:underline">Open BLS →</div>
          </a>

          {/* Screener */}
          <a
            href="/screener"
            className="group block rounded-2xl border bg-white p-5 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Stock Screener</h3>
              <span className="text-xs rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">Markets</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Filter by price action, volume, market cap, sector and analyst ratings. Click a row for a live chart.
            </p>
            <div className="mt-4 text-sm text-blue-600 group-hover:underline">Open Screener →</div>
          </a>
        </div>

        {/* Optional: a news tease row */}
        <div className="mt-6 text-center">
          <a
            href="/news"
            className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            Browse Market News
            <span aria-hidden>→</span>
          </a>
        </div>
      </section>

      {/* Footer note */}
      <footer className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-gray-500">
          This site republishes SEC EDGAR filings and BLS data. © {new Date().getFullYear()} Herevna.io
        </div>
      </footer>
    </main>
  );
}
