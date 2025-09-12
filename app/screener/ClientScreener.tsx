// app/screener/ClientScreener.tsx
"use client";

import { useState, Suspense } from "react";
import InsiderTape from "../components/InsiderTape";
import CryptoDashboard from "../components/CryptoDashboard";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full px-3 py-1.5 text-sm transition",
        active
          ? "bg-black text-white"
          : "bg-white text-gray-800 border hover:bg-gray-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function ClientScreener() {
  const [tab, setTab] = useState<"insider" | "crypto">("insider");

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100">
      <section className="mx-auto max-w-6xl px-4 pt-10 pb-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
          Screener
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Explore insider activity and crypto market stats.
        </p>

        {/* Tabs */}
        <div className="mt-4 flex gap-2">
          <TabButton active={tab === "insider"} onClick={() => setTab("insider")}>
            Insider Activity
          </TabButton>
          <TabButton active={tab === "crypto"} onClick={() => setTab("crypto")}>
            Crypto
          </TabButton>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10">
        <Suspense fallback={<div className="text-sm text-gray-500">Loading…</div>}>
          {tab === "insider" ? (
            // No props — InsiderTape owns its filters/state now
            <InsiderTape />
          ) : (
            <CryptoDashboard />
          )}
        </Suspense>
      </section>
    </main>
  );
}