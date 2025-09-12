// app/screener/page.tsx
import { Suspense } from "react";
import ClientScreener from "./ClientScreener";

export const metadata = {
  title: "Screener — Herevna",
};

export default function ScreenerPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <ClientScreener />
    </Suspense>
  );
}