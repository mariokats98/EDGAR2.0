// app/edgar/InsiderInput.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = {
  name: string;   // e.g., "Elon Musk"
  hint?: string;  // optional: company/ticker or count
};

export default function InsiderInput({
  onSelect,
  placeholder = "Type an insider’s name…",
}: {
  onSelect: (name: string) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // debounced fetch
  useEffect(() => {
    if (!q.trim()) {
      setSuggestions([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/insider?q=${encodeURIComponent(q.trim())}`, {
          signal: ac.signal,
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed");
        const list: Suggestion[] = Array.isArray(j?.suggestions) ? j.suggestions : [];
        setSuggestions(list);
        setOpen(true);
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message || "Error");
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(id);
      ac.abort();
    };
  }, [q]);

  return (
    <div className="relative" ref={wrapRef}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => suggestions.length && setOpen(true)}
        placeholder={placeholder}
        className="border rounded-md px-3 py-2 w-full"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="insider-suggest"
      />

      {/* dropdown */}
      {open && (
        <div
          id="insider-suggest"
          className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow-lg max-h-64 overflow-auto"
          // keep open while mouse moves into the panel
          onMouseDown={(e) => {
            // prevent input from losing focus immediately
            e.preventDefault();
          }}
        >
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-600">Searching…</div>
          )}
          {error && (
            <div className="px-3 py-2 text-sm text-red-600">Error: {error}</div>
          )}
          {!loading && !error && suggestions.length === 0 && q.trim() && (
            <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
          )}
          {suggestions.map((s, i) => (
            <button
              key={`${s.name}-${i}`}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
              onClick={() => {
                onSelect(s.name);
                setQ(s.name);
                setOpen(false);
              }}
            >
              <div className="font-medium">{s.name}</div>
              {s.hint && <div className="text-xs text-gray-500">{s.hint}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}