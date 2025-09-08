// app/components/TickerBar.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type TItem = {
  symbol: string;
  label: string;
  value: number | null;
  delta: number | null; // % for equities; raw change for rates if available
  unit?: string;        // "%", "", etc.
};

export default function TickerBar() {
  const [items, setItems] = useState<TItem[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<any>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/ticker", { cache: "no-store" });
      const j = await r.json();
      if (j?.items) setItems(j.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Duplicate items to create a seamless loop
  const loop = [...items, ...items];

  return (
    <div className="w-full border-b bg-white">
      <div className="relative overflow-hidden">
        <div className="marquee flex items-center gap-8 py-2">
          {loop.map((it, i) => (
            <TickerPill key={`${it.symbol}-${i}`} item={it} />
          ))}
          {loading && items.length === 0 && <span className="text-xs text-gray-500">Loading quotes…</span>}
        </div>
      </div>
    </div>
  );
}

function TickerPill({ item }: { item: TItem }) {
  const { label, value, delta, unit } = item;
  const up = typeof delta === "number" && delta > 0;
  const down = typeof delta === "number" && delta < 0;

  return (
    <div className="flex items-center gap-2 rounded-full border px-3 py-1 bg-white shadow-sm">
      <span className="text-xs font-medium text-gray-800">{label}</span>
      <span className="text-xs text-gray-700">
        {value == null ? "—" : formatNumber(value)}{unit || ""}
      </span>
      {typeof delta === "number" && (
        <span className={`text-xs ${up ? "text-emerald-600" : down ? "text-red-600" : "text-gray-500"}`}>
          {delta > 0 ? "↑" : delta < 0 ? "↓" : "•"} {formatDelta(delta, unit)}
        </span>
      )}
    </div>
  );
}

function formatNumber(n: number) {
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toFixed(2);
}

function formatDelta(d: number, unit?: string) {
  // If unit is "%", delta already is percent for equities (AV)
  if (unit === "%") return `${Math.abs(d).toFixed(2)}%`;
  // Otherwise, show raw change to 2dp
  return `${Math.abs(d).toFixed(2)}`;
}

