// app/edgar/InsiderInput.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Suggestion = {
  label: string;
  sublabel?: string;
  value: string; // we pass CIK10 for reliability
  alt?: string;  // ticker (optional)
  name?: string; // company name (optional)
  kind: "company" | "cik";
};

export default function InsiderInput({
  placeholder,
  value,
  onPick,
  onType,
}: {
  placeholder?: string;
  value?: string;
  onPick: (val: string) => void; // we’ll pass CIK10
  onType?: (val: string) => void;
}) {
  const [q, setQ] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Keep external value in sync (if parent changes it)
  useEffect(() => {
    if (value !== undefined) setQ(value);
  }, [value]);

  // Close on click outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Debounced fetch
  const debouncedQ = useDebounce(q, 250);

  useEffect(() => {
    onType?.(q);
    // If empty or just 1 char, don’t spam the API
    if (!debouncedQ || debouncedQ.trim().length < 1) {
      setItems([]);
      setOpen(false);
      return;
    }

    // If user typed a numeric CIK, short-circuit (shows a single option)
    if (/^\d{1,10}$/.test(debouncedQ.trim())) {
      const cik10 = debouncedQ.trim().padStart(10, "0");
      setItems([
        { label: `CIK ${cik10}`, sublabel: "Enter to use exact CIK", value: cik10, kind: "cik" },
      ]);
      setOpen(true);
      setHighlight(0);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const url = `/api/suggest?q=${encodeURIComponent(debouncedQ)}`;
        const r = await fetch(url, { cache: "no-store" });
        const j = (await r.json()) as { ok: boolean; data: Suggestion[] };
        if (!cancelled) {
          setItems(j?.data || []);
          setOpen(true);
          setHighlight(0);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          setOpen(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQ, onType]);

  function choose(i: number) {
    const hit = items[i];
    if (!hit) return;
    setQ(hit.label);   // show label in the input for user clarity
    setOpen(false);
    onPick(hit.value); // pass CIK10 up to the page
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(items.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(highlight);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative w-full" ref={boxRef}>
      <input
        type="text"
        value={q}
        placeholder={placeholder || "Search by ticker, name, or CIK…"}
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
          onClick={() => {
            setQ("");
            setItems([]);
            setOpen(false);
            onType?.("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label="Clear"
        >
          ×
        </button>
      )}

      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-md border bg-white shadow-lg max-h-80 overflow-auto">
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No suggestions</div>
          )}
          {!loading &&
            items.map((it, i) => (
              <button
                key={`${it.value}_${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                className={`block w-full text-left px-3 py-2 text-sm ${
                  i === highlight ? "bg-gray-100" : ""
                }`}
              >
                <div className="font-medium">{it.label}</div>
                {it.sublabel && (
                  <div className="text-[11px] text-gray-500">{it.sublabel}</div>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function useDebounce<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}