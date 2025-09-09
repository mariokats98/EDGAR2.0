// app/edgar/InsiderInput.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = {
  label: string;
  value: string; // CIK (padded)
  cik: string;
  ticker: string;
  name: string;
};

export default function InsiderInput(props: {
  placeholder?: string;
  value: string;
  onType: (v: string) => void;
  onPick: (v: string) => void; // we pass CIK (value) here
}) {
  const { placeholder, value, onType, onPick } = props;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const tRef = useRef<number | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // Debounced fetch suggestions
  useEffect(() => {
    if (tRef.current) window.clearTimeout(tRef.current);
    const q = value.trim();
    if (!q) {
      setItems([]);
      setOpen(false);
      return;
    }

    tRef.current = window.setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const j = (await r.json()) as {
          ok: boolean;
          suggestions?: Suggestion[];
          error?: string;
        };
        if (!r.ok || j.ok === false) throw new Error(j?.error || "Suggest failed");
        const list = j.suggestions || [];
        setItems(list);
        setOpen(true);
      } catch (e: any) {
        setItems([]);
        setErr(e?.message || "Suggest failed");
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => {
      if (tRef.current) window.clearTimeout(tRef.current);
    };
  }, [value]);

  return (
    <div ref={boxRef} className="relative">
      <input
        className="w-full border rounded-md px-3 py-2"
        placeholder={placeholder || "Start typing a ticker or company…"}
        value={value}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => value.trim() && setOpen(true)}
      />

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow">
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
          )}
          {!loading && err && (
            <div className="px-3 py-2 text-sm text-red-600">{err}</div>
          )}
          {!loading && !err && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No suggestions</div>
          )}
          {!loading &&
            !err &&
            items.map((s) => (
              <button
                key={s.cik}
                type="button"
                onClick={() => {
                  // Set the input to a nice display and pass CIK upward
                  onType(`${s.ticker} — ${s.name}`);
                  onPick(s.value); // value is CIK (padded)
                  setOpen(false);
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                title={`CIK ${s.cik}`}
              >
                {s.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}