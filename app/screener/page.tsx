// app/screener/page.tsx
"use client";

import InsiderTape from "../../components/InsiderTape";

export default function ScreenerPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 px-4 py-12">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900">
            Insider Activity
          </h1>
          <p className="mt-3 text-gray-600 max-w-2xl mx-auto">
            Track the latest insider buys and sells. Green means{" "}
            <span className="font-semibold text-emerald-600">buys</span>, red
            means <span className="font-semibold text-red-600">sells</span>.
          </p>
        </header>

        {/* Insider Tape */}
        <InsiderTape defaultSymbol="" limit={50} />
      </div>
    </main>
  );
}