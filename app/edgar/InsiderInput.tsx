// app/edgar/InsiderInput.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Suggest = { cik: string; ticker: string | null; name: string; display: string };

export default function InsiderInput({
  placeholder,
  value,
  onType,
  onPick,
}: {
  placeholder?: string;
  value: string;
  onType: (val: string) => void;
  onPick: (val: string) => void; // pass either picked CIK or raw input on Enter
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggest[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const acRef = useRef<AbortController | null>(null);
  const debRef = useRef<number | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // fetch suggestions (debounced + cancel previous)
  useEffect(() => {
    if (debRef.current) window.clearTimeout(debRef.current);
    if (!value || value.trim().length < 1) {
      setItems([]); setOpen(false); return;
    }
    debRef.current = window.setTimeout(async () => {
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      try {
        setLoading(true);
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(value)}`, { signal: ac.signal, cache: "no-store" });
        const j = await r.json();
        setItems(j?.suggestions || []);
        setActive(0);
        setOpen(true);
      } catch {
        if (!ac.signal.aborted) setItems([]);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 160);
    return () => { if (debRef.current) window.clearTimeout(debRef.current); };
  }, [value]);

  function pick(idx: number) {
    const it = items[idx];
    if (it?.cik) {
      onPick(it.cik); // always pass the CIK to caller
      setOpen(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, Math.max(0, items.length - 1))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (open && items.length) pick(active);
      else onPick(value); // let server resolve raw text
    }
  }

  return (
    <div className="relative w-full" ref={boxRef}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => value && setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full border rounded-md px-3 py-2"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow">
          {loading && <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No suggestions</div>
          )}
          {!loading && items.map((s, i) => (
            <button
              type="button"
              key={`${s.cik}-${i}`}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              onMouseEnter={() => setActive(i)}
              className={`w-full text-left px-3 py-2 text-sm ${i === active ? "bg-gray-100" : ""}`}
            >
              <div className="font-medium">{s.name}</div>
              <div className="text-gray-600 text-xs">
                {s.ticker ? `${s.ticker} · ` : ""}CIK {s.cik}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}