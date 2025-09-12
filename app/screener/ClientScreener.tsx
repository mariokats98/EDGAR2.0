// app/screener/ClientScreener.tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import InsiderTape from "../components/InsiderTape";

// If you have a CryptoDashboard component, dynamically import it (client-only)
const CryptoDashboard = dynamic(() => import("../components/CryptoDashboard"), { ssr: false, loading: () => null });

export default function ClientScreener() {
  const [tab, setTab] = useState<"insider" | "crypto">("insider");

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Screener</h1>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        <button
          className={`rounded-full px-4 py-2 text-sm ${tab === "insider" ? "bg-black text-white" : "bg-white border"}`}
          onClick={() => setTab("insider")}
        >
          Insider Activity
        </button>
        <button
          className={`rounded-full px-4 py-2 text-sm ${tab === "crypto" ? "bg-black text-white" : "bg-white border"}`}
          onClick={() => setTab("crypto")}
        >
          Crypto
        </button>
      </div>

      {tab === "insider" ? (
        <InsiderTape />
      ) : (
        <section className="rounded-2xl border bg-white p-4 md:p-5">
          {CryptoDashboard ? <CryptoDashboard /> : <div className="text-sm text-gray-500">Loading…</div>}
        </section>
      )}
    </main>
  );
}
