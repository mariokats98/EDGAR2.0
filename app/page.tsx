// app/page.tsx
"use client";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100">
      {/* Background accents */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600/10 to-indigo-600/10 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[-6rem] h-80 w-80 rounded-full bg-gradient-to-tr from-emerald-400/10 to-cyan-500/10 blur-3xl" />
      </div>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border bg-white/70 backdrop-blur px-3 py-1 text-xs text-gray-700 shadow-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Live data • SEC • BLS • FRED
        </span>

        <h1 className="mt-4 text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-gray-900">
          Accessible Data.{" "}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            Less Clutter.
          </span>{" "}
          More Research.
        </h1>

        <p className="mt-4 text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
          Streamlined SEC filings, economic releases, and market insights. Built
          for speed, clarity, and easy research.
        </p>

        {/* Quick actions */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href="/edgar"
            className="inline-flex items-center gap-2 rounded-full bg-black text-white px-5 py-2.5 text-sm hover:opacity-90 transition"
          >
            Explore EDGAR
            <svg
              aria-hidden
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeWidth="2"
                strokeLinecap="round"
                d="M7 17L17 7M9 7h8v8"
              />
            </svg>
          </a>
          <a
            href="/bls"
            className="inline-flex items-center gap-2 rounded-full bg-white text-gray-900 border px-5 py-2.5 text-sm hover:bg-gray-50 transition"
          >
            Explore BLS
          </a>
          <a
            href="/fred"
            className="inline-flex items-center gap-2 rounded-full bg-white text-gray-900 border px-5 py-2.5 text-sm hover:bg-gray-50 transition"
          >
            Explore FRED
          </a>
          <a
            href="/screener"
            className="inline-flex items-center gap-2 rounded-full bg-white text-gray-900 border px-5 py-2.5 text-sm hover:bg-gray-50 transition"
          >
            Explore Screener
          </a>
        </div>

        {/* Small helper line */}
        <p className="mt-3 text-xs text-gray-500">
          Tip: Use the pages’ search bars to type a ticker, company, or CIK
          (e.g., <span className="font-mono">NVDA</span>).
        </p>
      </section>

      {/* Feature cards */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-5 md:grid-cols-4">
          {/* EDGAR */}
          <a
            href="/edgar"
            className="group block rounded-2xl border bg-white p-5 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">EDGAR Filings</h3>
              <span className="text-xs rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                SEC
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Search 8-K, 10-Q, 10-K, S-1, 13D/G, 6-K and more. Filter by dates,
              form types, and reporting persons.
            </p>
            <div className="mt-4 text-sm text-blue-600 group-hover:underline">
              Open EDGAR →
            </div>
          </a>

          {/* BLS */}
          <a
            href="/bls"
            className="group block rounded-2xl border bg-white p-5 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">BLS Dashboard</h3>
              <span className="text-xs rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                Economy
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Track CPI, Unemployment, Payrolls and more. View latest prints,
              trends, and release calendars.
            </p>
            <div className="mt-4 text-sm text-blue-600 group-hover:underline">
              Open BLS →
            </div>
          </a>

          {/* FRED */}
          <a
            href="/fred"
            className="group block rounded-2xl border bg-white p-5 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">FRED Benchmarks</h3>
              <span className="text-xs rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">
                Rates
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Explore U.S. interest rates, yield curves, and macro benchmarks.
              Filter by series and date ranges.
            </p>
            <div className="mt-4 text-sm text-blue-600 group-hover:underline">
              Open FRED →
            </div>
          </a>

          {/* Screener */}
          <a
            href="/screener"
            className="group block rounded-2xl border bg-white p-5 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Stock Screener</h3>
              <span className="text-xs rounded-full bg-purple-50 px-2 py-1 text-purple-700">
                Markets
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Filter by price action, volume, market cap, sector, and more.
              Click a row for a live chart.
            </p>
            <div className="mt-4 text-sm text-blue-600 group-hover:underline">
              Open Screener →
            </div>
          </a>
        </div>

        {/* News tease row */}
        <div className="mt-8 grid place-items-center">
          <a
            href="/news"
            className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm hover:bg-gray-50 transition"
          >
            Browse Market News <span aria-hidden>→</span>
          </a>
        </div>
      </section>

      {/* CTA strip */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="rounded-2xl border bg-white/80 backdrop-blur p-6 text-center shadow-sm">
          <h4 className="text-lg font-semibold text-gray-900">
            Ready to research faster?
          </h4>
          <p className="mt-1 text-sm text-gray-600">
            Jump straight into filings, macro prints, or benchmarks—no setup
            required.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <a
              href="/edgar"
              className="inline-flex items-center gap-2 rounded-full bg-black text-white px-5 py-2.5 text-sm hover:opacity-90 transition"
            >
              Start with EDGAR
            </a>
            <a
              href="/ai"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2.5 text-sm shadow hover:opacity-95 transition"
            >
              ✨ Ask Herevna AI
            </a>
          </div>
        </div>
      </section>

      {/* Footer note */}
      <footer className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-gray-500">
          This site republishes SEC EDGAR filings, BLS data, and FRED data. ©{" "}
          {new Date().getFullYear()} Herevna.io
        </div>
      </footer>
    </main>
  );
}