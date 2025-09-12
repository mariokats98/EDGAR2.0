// app/screener/page.tsx
"use client";

import InsiderTape from "../components/InsiderTape";
import dynamic from "next/dynamic";

// CryptoDashboard uses window events for the SVG tooltip; make sure it's client-only.
const CryptoDashboard = dynamic(() => import("../components/CryptoDashboard"), {
  ssr: false,
});

export default function ScreenerPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* INSIDERS */}
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Insider Activity</h1>
        <p className="text-gray-600 text-sm">
          Track insider purchases (A) and sales (D). Filter by symbol, date range, and more.
        </p>
      </header>
      <InsiderTape />

      {/* CRYPTO */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Crypto Stats</h2>
        <p className="text-gray-600 text-sm mb-3">
          Live quotes, market caps, and an interactive daily chart. Powered by FMP.
        </p>
        <CryptoDashboard />
      </section>

      <footer className="mt-10 text-center text-xs text-gray-500">
        Sources: Financial Modeling Prep (primary). © {new Date().getFullYear()} Herevna.io
      </footer>
    </main>
  );
}