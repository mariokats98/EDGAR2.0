import { Suspense } from "react";
import ClientScreener from "./ClientScreener";

export default function ScreenerPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <ClientScreener />
    </Suspense>
  );
}