// app/screener/page.tsx
"use client";

import InsiderTape from "../components/InsiderTape";

export default function ScreenerPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Insider Activity</h1>
        <p className="text-gray-600 text-sm">
          Track insider purchases (A) and sales (D). Filter by symbol, date range, and more.
        </p>
      </header>

      <InsiderTape />

      <footer className="mt-8 text-center text-xs text-gray-500">
        Source: FMP (primary) with SEC fallback for pointers. Links open the best available document or index.
      </footer>
    </main>
  );
}