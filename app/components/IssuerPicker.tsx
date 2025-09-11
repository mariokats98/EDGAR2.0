// components/IssuerPicker.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Issuer = { cik: string; ticker: string; name: string };

export default function IssuerPicker({
  open,
  onClose,
  onPickCIK,
  onPickTicker,
}: {
  open: boolean;
  onClose: () => void;
  onPickCIK?: (cik: string) => void;
  onPickTicker?: (ticker: string) => void;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Issuer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const perPage = 50;
  const debouncedQ = useDebounce(q, 250);

  useEffect(() => { setPage(1); }, [debouncedQ]);

  useEffect(() => {
    if (!open) return;
    let aborted = false;
    (async () => {
      try {
        setLoading(true);
        const u = new URL("/api/issuers", window.location.origin);
        if (debouncedQ) u.searchParams.set("q", debouncedQ);
        u.searchParams.set("page", String(page));
        u.searchParams.set("perPage", String(perPage));
        const r = await fetch(u.toString(), { cache: "no-store" });
        const j = await r.json();
        if (!aborted) {
          if (j?.ok) {
            setRows(j.data || []);
            setTotal(j.total || 0);
          } else {
            setRows([]); setTotal(0);
          }
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => { aborted = true; };
  }, [open, debouncedQ, page]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  function copy(text: string) {
    try { navigator.clipboard?.writeText(text); } catch {}
  }

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none opacity-0"} transition`}
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-16 w-[min(850px,92vw)] -translate-x-1/2 rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="text-base font-semibold">Find CIK / Ticker</h3>
            <p className="text-xs text-gray-500">Search the full SEC issuer list by name, ticker, or CIK.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type company name, ticker (e.g., NVDA), or CIK…"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        {/* List */}
        <div className="max-h-[60vh] overflow-auto px-4 pb-4">
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-500">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">No matches.</div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {rows.map((r) => (
                <li key={`${r.cik}-${r.ticker}`} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="text-xs text-gray-500">
                      Ticker: <span className="font-mono">{r.ticker || "—"}</span> · CIK:{" "}
                      <span className="font-mono">{r.cik}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { copy(r.cik); onPickCIK?.(r.cik); onClose(); }}
                      className="rounded-full border px-3 py-1.5 text-xs hover:bg-gray-50"
                    >
                      Use CIK
                    </button>
                    {r.ticker && (
                      <button
                        onClick={() => { onPickTicker?.(r.ticker); onClose(); }}
                        className="rounded-full bg-black px-3 py-1.5 text-xs text-white hover:opacity-90"
                      >
                        Use Ticker
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t p-3 text-sm">
          <div className="text-gray-600">
            {total.toLocaleString()} issuers • Page {page} / {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border bg-white px-3 py-1.5 disabled:opacity-50"
            >
              ← Prev
            </button>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={page}
              onChange={(e) => setPage(Math.min(Math.max(1, Number(e.target.value) || 1), totalPages))}
              className="w-16 rounded-md border px-2 py-1.5 text-center"
            />
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border bg-white px-3 py-1.5 disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* small debounce helper */
function useDebounce<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}