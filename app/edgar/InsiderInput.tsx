// app/edgar/InsiderInput.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type SuggestItem = {
  label: string;     // "NVIDIA Corp (NVDA)"
  ticker?: string;
  cik?: string;      // 10-digit, left-padded
};

export default function InsiderInput({
  value,
  onPick,
  onType,
  placeholder,
}: {
  value: string;
  onPick: (val: string) => void;
  onType?: (val: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<SuggestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", handle);
    return () => window.removeEventListener("click", handle);
  }, []);

  async function querySuggestions(q: string) {
    if (!q || q.trim().length < 1) {
      setList([]);
      return;
    }
    setLoading(true);
    try {
      // Try your /api/suggest route if present:
      let r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as { items?: SuggestItem[] };
        if (j?.items?.length) {
          setList(j.items.slice(0, 8));
          return;
        }
      }

      // Fallback: SEC official ticker list
      const rr = await fetch("https://www.sec.gov/files/company_tickers.json", {
        headers: { "User-Agent": "Herevna.io admin@herevna.io" },
        cache: "force-cache",
      });
      if (!rr.ok) {
        setList([]);
        return;
      }
      const data: Record<string, { cik_str: number; ticker: string; title: string }> = await rr.json();
      const up = q.trim().toUpperCase();
      const items: SuggestItem[] = [];
      for (const k of Object.keys(data)) {
        const row = data[k];
        if (
          row.ticker.toUpperCase().startsWith(up) ||
          row.title.toUpperCase().includes(up)
        ) {
          items.push({
            label: `${row.title} (${row.ticker})`,
            ticker: row.ticker,
            cik: String(row.cik_str).padStart(10, "0"),
          });
          if (items.length >= 8) break;
        }
      }
      setList(items);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onType?.(v);
          setOpen(true);
          void querySuggestions(v);
        }}
        onFocus={() => {
          setOpen(true);
          if (value) void querySuggestions(value);
        }}
        placeholder={placeholder}
        className="w-full border rounded-md px-3 py-2"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow">
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>
          )}
          {!loading && list.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No suggestions</div>
          )}
          {!loading &&
            list.map((it) => (
              <button
                key={it.cik ? `${it.cik}-${it.ticker}` : it.label}
                className="block w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                onClick={() => {
                  // prefer ticker if present, otherwise CIK
                  onPick(it.ticker || it.cik || it.label);
                  setOpen(false);
                }}
              >
                {it.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}