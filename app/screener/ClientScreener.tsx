// app/screener/ClientScreener.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import StocksDashboard from "../components/StocksDashboard";
import InsiderTape from "../components/InsiderTape";
import CryptoDashboard from "../components/CryptoDashboard";
import CongressionalTracker from "../components/CongressionalTracker";

type TabKey = "stocks" | "insider" | "crypto" | "congress";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "stocks", label: "Stocks", icon: "📈" },
  { key: "insider", label: "Insider", icon: "🧑‍💼" },
  { key: "crypto", label: "Crypto", icon: "🪙" },
  { key: "congress", label: "Congress", icon: "🏛️" },
];

export default function ClientScreener({
  initialTab,
}: {
  initialTab?: string; // optional; we coerce to TabKey safely
}) {
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname();

  // Determine starting tab (URL ?tab= takes priority; then prop; then default)
  const start = useMemo<TabKey>(() => {
    const q = (search?.get("tab") || initialTab || "stocks").toLowerCase();
    return (TABS.find((t) => t.key === q)?.key ?? "stocks") as TabKey;
  }, [search, initialTab]);

  const [active, setActive] = useState<TabKey>(start);

  // Keep state in sync if URL param changes (e.g., back/forward)
  useEffect(() => {
    setActive(start);
  }, [start]);

  // Helper to update URL (keeps you on /screener, sets ?tab=)
  function setTab(next: TabKey) {
    setActive(next);
    const params = new URLSearchParams(search?.toString() || "");
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // scroll back to top of section for better UX
    window?.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-5">
      {/* Segmented control */}
      <div className="mb-4 rounded-xl border bg-white p-2">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {TABS.map((t) => {
            const isActive = active === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-black text-white shadow"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
                aria-pressed={isActive}
              >
                <span className="mr-1">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section body */}
      <div className="space-y-4">
        {active === "stocks" && <StocksDashboard />}
        {active === "insider" && <InsiderTape />}
        {active === "crypto" && <CryptoDashboard />}
        {active === "congress" && <CongressionalTracker />}
      </div>
    </div>
  );
}