// app/screener/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0; // no ISR
export const fetchCache = "force-no-store";

import { Suspense } from "react";
import ClientScreener from "./ClientScreener";

export default function ScreenerPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Screener</h1>
      <p className="text-gray-600 text-sm mb-4">
        Insider transactions and crypto stats in one place.
      </p>

      <Suspense
        fallback={
          <div className="mt-6 rounded-xl border bg-white p-6 text-sm text-gray-600">
            Loading screener…
          </div>
        }
      >
        <ClientScreener />
      </Suspense>
    </main>
  );
}