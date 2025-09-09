// app/edgar/InsiderInput.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = {
  label: string;
  sublabel?: string;
  value: string;  // CIK10
  alt?: string;
  name?: string;
  kind: "company" | "cik";
};

export default function InsiderInput({
  placeholder,
  value,
  onPick,  // gets CIK10
  onType,
}: {
  placeholder?: string;
  value?: string;
  onPick: (cik10: string) => void;
  onType?: (text: string) => void;
}) {
  const [q, setQ] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (value !== undefined) setQ(value); }, [value]);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  // debounce
  useEffect(() => {
    onType?.(q);
    const text = q.trim();
    if (!text) {
      setItems([]); setOpen(false); return;
    }

    // Numeric CIK shortcut
    if (/^\d{1,10}$/.test(text)) {
      const cik10 = text.padStart(10, "0");
      setItems([{ label: `CIK ${cik10}`, sublabel: "Enter to use exact CIK", value: cik10, kind: "cik" }]);
      setHi(0);
      setOpen(true);
      return;
    }

    let stop = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(text)}`, { cache: "no-store" });
        const j = (await r.json()) as { ok: boolean; data: Suggestion[] };
        if (!stop) {
          setItems(j?.data || []);
          setHi(0);
          setOpen(true);
        }
      } catch {
        if (!stop) { setItems([]); setOpen(false); }
      } finally {
        if (!stop) setLoading(false);
      }
    }, 250);
    return () => { stop = true; clearTimeout(t); };
  }, [q, onType]);

  function choose(i: number) {
    const s = items[i];
    if (!s) return;
    // Fill input with label for user clarity, send CIK10 up
    setQ(s.label);
    setOpen(false);
    onPick(s.value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((v) => Math.min(items.length - 1, v + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((v) => Math.max(0, v - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(hi); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="relative w-full" ref={boxRef}>
      <input
        type="text"
        value={q}
        placeholder={placeholder || "Search by ticker, company, or CIK…"}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full border rounded-md px-3 py-2"
        autoComplete="off"
        spellCheck={false}
      />
      {!!q && (
        <button
          type="button"
          onClick={() => { setQ(""); setItems([]); setOpen(false); onType?.(""); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label="Clear"
        >
          ×
        </button>
      )}

      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-md border bg-white shadow-lg max-h-80 overflow-auto">
          {loading && <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>}
          {!loading && items.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">No suggestions</div>}
          {!loading && items.map((it, i) => (
            <button
              key={`${it.value}_${i}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={`block w-full text-left px-3 py-2 text-sm ${i === hi ? "bg-gray-100" : ""}`}
            >
              <div className="font-medium">{it.label}</div>
              {it.sublabel && <div className="text-[11px] text-gray-500">{it.sublabel}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}