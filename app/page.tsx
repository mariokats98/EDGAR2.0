// app/page.tsx
"use client";

import * as React from "react";
import NewsletterForm from "./components/NewsletterForm";

/**
 * Reads a simple "isPro=1" cookie (set this after Stripe success/webhook).
 * If present -> unlocks all features on the homepage.
 */
function useIsProFromCookie() {
  const [isPro, setIsPro] = React.useState(false);
  React.useEffect(() => {
    try {
      const match = document.cookie.match(/(?:^|;\s*)isPro=([^;]+)/);
      setIsPro(match?.[1] === "1");
    } catch {}
  }, []);
  return isPro;
}

function lockedClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  e.preventDefault();
  const params = new URLSearchParams({ from: href });
  window.location.href = `/subscribe?${params.toString()}`;
}

export default function HomePage() {
  const isPro = useIsProFromCookie();

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
          EDGAR • BLS • FRED • NEWS • AND MORE!
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
          {/* EDGAR is always open */}
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
              <path strokeWidth="2" strokeLinecap="round" d="M7 17L17 7M9 7h8v8" />
            </svg>
          </a>

          {/* Locked CTAs (unlock automatically if isPro) */}
          {[
            { label: "Explore BLS", href: "/bls" },
            { label: "Explore FRED", href: "/fred" },
            { label: "Explore Screener", href: "/screener" },
          ].map((x) =>
            isPro ? (
              <a
                key={x.href}
                href={x.href}
                className="inline-flex items-center gap-2 rounded-full bg-white text-gray-900 border px-5 py-2.5 text-sm hover:bg-gray-50 transition"
              >
                {x.label}
              </a>
            ) : (
              <a
                key={x.href}
                href="#"
                onClick={(e) => lockedClick(e, x.href)}
                className="group relative inline-flex items-center gap-2 rounded-full bg-white text-gray-900 border px-5 py-2.5 text-sm transition"
              >
                {x.label}
                <span className="ml-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  Locked
                </span>
                {/* hover tooltip */}
                <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border bg-white px-2 py-1 text-xs text-gray-700 shadow opacity-0 group-hover:opacity-100 transition">
                  Subscription required — click to upgrade
                </span>
              </a>
            )
          )}
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-5 md:grid-cols-4">
          {/* EDGAR (open) */}
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

          {/* BLS (locked unless Pro) */}
          {isPro ? (
            <a
              href="/bls"
              className="group block rounded-2xl border bg-white p-5 hover:shadow-md transition"
            >
              <TileHeader title="BLS Dashboard" badge="Economy" badgeClass="bg-emerald-50 text-emerald-700" />
              <TileCopy copy="Track CPI, Unemployment, Payrolls and more. View latest prints, trends, and release calendars." />
              <TileCta text="Open BLS →" />
            </a>
          ) : (
            <LockedTile
              href="/bls"
              title="BLS Dashboard"
              badge="Economy"
              badgeClass="bg-emerald-50 text-emerald-700"
            />
          )}

          {/* FRED (locked unless Pro) */}
          {isPro ? (
            <a
              href="/fred"
              className="group block rounded-2xl border bg-white p-5 hover:shadow-md transition"
            >
              <TileHeader title="FRED Benchmarks" badge="Rates" badgeClass="bg-indigo-50 text-indigo-700" />
              <TileCopy copy="Explore U.S. interest rates, yield curves, and macro benchmarks. Filter by series and date ranges." />
              <TileCta text="Open FRED →" />
            </a>
          ) : (
            <LockedTile
              href="/fred"
              title="FRED Benchmarks"
              badge="Rates"
              badgeClass="bg-indigo-50 text-indigo-700"
            />
          )}

          {/* Screener (locked unless Pro) */}
          {isPro ? (
            <a
              href="/screener"
              className="group block rounded-2xl border bg-white p-5 hover:shadow-md transition"
            >
              <TileHeader title="Stock Screener" badge="Markets" badgeClass="bg-purple-50 text-purple-700" />
              <TileCopy copy="Filter by price action, volume, market cap, sector, and more. Click a row for a live chart." />
              <TileCta text="Open Screener →" />
            </a>
          ) : (
            <LockedTile
              href="/screener"
              title="Stock Screener"
              badge="Markets"
              badgeClass="bg-purple-50 text-purple-700"
            />
          )}
        </div>

        {/* News tease row (you can lock this too if needed) */}
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
          <h4 className="text-lg font-semibold text-gray-900">Ready to research faster?</h4>
          <p className="mt-1 text-sm text-gray-600">
            Jump straight into filings, macro prints, or benchmarks—no setup required.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <a
              href="/edgar"
              className="inline-flex items-center gap-2 rounded-full bg-black text-white px-5 py-2.5 text-sm hover:opacity-90 transition"
            >
              Start with EDGAR
            </a>
            <a
              href={isPro ? "/ai" : "/subscribe?from=/ai"}
              onClick={(e) => {
                if (!isPro) {
                  e.preventDefault();
                  window.location.href = "/subscribe?from=/ai";
                }
              }}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2.5 text-sm shadow hover:opacity-95 transition"
            >
              ✨ Ask Herevna AI
              {!isPro && (
                <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px]">Pro</span>
              )}
            </a>
          </div>
        </div>
      </section>

      {/* Newsletter Signup */}
      <section className="bg-slate-50 py-12 text-center">
        <h2 className="text-xl font-semibold text-gray-900">Stay updated with Herevna</h2>
        <p className="text-gray-600 text-sm mt-1">
          Get the latest filings, economic updates, and news straight to your inbox.
        </p>
        <div className="mt-4">
          <NewsletterForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-gray-500">
          This site republishes SEC EDGAR filings, BLS data, and FRED data. © {new Date().getFullYear()} Herevna.io
        </div>
      </footer>
    </main>
  );
}

/* -------- Small presentational bits to avoid duplication -------- */

function TileHeader({
  title,
  badge,
  badgeClass,
}: {
  title: string;
  badge: string;
  badgeClass: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">{title}</h3>
      <span className={`text-xs rounded-full px-2 py-1 ${badgeClass}`}>{badge}</span>
    </div>
  );
}

function TileCopy({ copy }: { copy: string }) {
  return <p className="mt-2 text-sm text-gray-600">{copy}</p>;
}

function TileCta({ text }: { text: string }) {
  return <div className="mt-4 text-sm text-blue-600 group-hover:underline">{text}</div>;
}

function LockedTile({
  href,
  title,
  badge,
  badgeClass,
}: {
  href: string;
  title: string;
  badge: string;
  badgeClass: string;
}) {
  return (
    <div className="group relative block rounded-2xl border bg-white p-5 hover:shadow-md transition">
      <a
        href="#"
        onClick={(e) => lockedClick(e, href)}
        className="absolute inset-0"
        aria-label={`${title} (locked)`}
      />
      <TileHeader title={title} badge={badge} badgeClass={badgeClass} />
      <TileCopy copy="This feature is for Pro subscribers." />
      <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium">
          Locked
        </span>
        <span className="hidden sm:inline">Subscription required</span>
      </div>

      {/* hover tooltip */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border bg-white px-2 py-1 text-xs text-gray-700 shadow opacity-0 group-hover:opacity-100 transition">
        Click to subscribe
      </div>
    </div>
  );
}