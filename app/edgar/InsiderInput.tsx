"use client";

import { useEffect, useRef, useState } from "react";

type SuggestHit = { cik: string; name: string; ticker?: string };

export default function InsiderInput({
  value,
  onChange,
  onPick,
  placeholder,
  api = "/api/suggest",
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (hit: SuggestHit) => void;
  placeholder?: string;
  api?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SuggestHit[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // click-outside to close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // fetch suggestions
  useEffect(() => {
    const q = value.trim();
    if (!q) { setHits([]); setOpen(false); return; }

    const id = setTimeout(async () => {
      try {
        setLoading(true);
        const r = await fetch(`${api}?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = await r.json();
        const data: SuggestHit[] = (j?.data || []).slice(0, 8);
        setHits(data);
        setOpen(true);
      } catch {
        setHits([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => clearTimeout(id);
  }, [value, api]);

  return (
    <div ref={boxRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border px-3 py-2"
        onFocus={() => value.trim() && setOpen(true)}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow">
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
          )}
          {!loading && hits.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
          )}
          {!loading && hits.map((h) => (
            <button
              key={h.cik}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => { onPick(h); setOpen(false); }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">{h.name}</span>
                {h.ticker && <span className="text-xs text-gray-500">{h.ticker}</span>}
              </div>
              <div className="text-[11px] text-gray-500">CIK {h.cik}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}