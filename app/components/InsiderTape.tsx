// app/screener/page.tsx
"use client";

import InsiderTape from "../components/InsiderTape";

export default function ScreenerPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      {/* Header */}
      <section className="mx-auto max-w-6xl px-4 pt-8 pb-2">
        <h1 className="text-2xl font-semibold">Screener — Insider Flow</h1>
        <p className="text-gray-600 text-sm">
          Track Form 4 insider buys and sells with amount, price, value, and beneficial ownership.
        </p>
      </section>

      {/* Insider transactions */}
      <InsiderTape />

      {/* Footer spacer */}
      <div className="h-8" />
    </main>
  );
}