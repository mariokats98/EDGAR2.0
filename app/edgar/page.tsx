// app/edgar/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type SuggestRow = { ticker: string; cik: string; name: string };
type Filing = {
  cik: string;
  company: string;
  form: string;
  filed_at: string;
  title?: string;
  source_url?: string;
  primary_doc_url?: string;
  badges?: string[];
};

export default function EdgarPage() {
  // UI state
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestRow[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resolved, setResolved] = useState<SuggestRow | null>(null);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loadingFilings, setLoadingFilings] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Debounced suggestions
  useEffect(() => {
    const v = q.trim();
    if (!v) { setSuggestions([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      try {
        setLoadingSuggest(true);
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(v)}`, { cache: "no-store" });
        const j = await r.json();
        setSuggestions(j?.data || []);
        setOpen(true);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoadingSuggest(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  async function resolveAndFetch(input: string) {
    setError(null);
    setResolved(null);
    setFilings([]);
    setLoadingFilings(true);
    try {
      // 1) Resolve -> CIK (handles tickers/names/CIKs)
      const L = await (await fetch(`/api/lookup/${encodeURIComponent(input)}`, { cache: "no-store" })).json();
      if (!L?.ok) throw new Error(L?.error || "Lookup failed");

      const exact: SuggestRow | null = L.exact || (Array.isArray(L.candidates) ? L.candidates[0] : null);
      if (!exact?.cik) {
        if (Array.isArray(L.candidates) && L.candidates.length) {
          setSuggestions(L.candidates);
          setOpen(true);
          throw new Error("Multiple matches. Pick one from the dropdown.");
        }
        throw new Error("Could not resolve company.");
      }
      setResolved(exact);

      // 2) Fetch filings (most recent first)
      const R = await fetch(`/api/filings/${exact.cik}?limit=12`, { cache: "no-store" });
      const data = await R.json();
      if (!R.ok) throw new Error(data?.error || "SEC fetch failed");
      const arr: Filing[] = Array.isArray(data) ? data : data?.data || [];
      arr.sort((a, b) => String(b.filed_at).localeCompare(String(a.filed_at)));
      setFilings(arr);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoadingFilings(false);
    }
  }

  function onPick(s: SuggestRow) {
    setQ(s.ticker || s.name);
    setOpen(false);
    resolveAndFetch(s.ticker || s.cik || s.name);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setOpen(false);
    resolveAndFetch(q.trim());
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">EDGAR Filings</h1>
          <p className="text-gray-600 text-sm mt-1">
            Search by <strong>Ticker</strong> (NVDA), <strong>Company</strong> (NVIDIA), or <strong>CIK</strong> (10 digits).
          </p>
        </header>

        {/* Search box + suggestions */}
        <div ref={boxRef} className="relative max-w-xl">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Try: NVDA • NVIDIA • 0000320193"
              className="border bg-white rounded-xl px-3 py-2 w-full"
            />
            <button
              className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-60"
              disabled={loadingFilings}
            >
              {loadingFilings ? "Getting…" : "Get"}
            </button>
          </form>

          {open && (suggestions.length > 0 || loadingSuggest) && (
            <div className="absolute z-20 mt-2 w-full rounded-xl border bg-white shadow-lg max-h-72 overflow-auto">
              {loadingSuggest && (
                <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
              )}
              {!loadingSuggest &&
                suggestions.map((s, i) => (
                  <button
                    key={`${s.cik}-${i}`}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => onPick(s)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{s.name || s.ticker}</div>
                        <div className="text-xs text-gray-600">
                          {s.ticker ? `${s.ticker} • ` : ""}CIK {s.cik}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              {!loadingSuggest && suggestions.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
              )}
            </div>
          )}
        </div>

        {/* Status + errors */}
        <div className="mt-3 text-sm">
          {resolved && (
            <span className="text-gray-600">
              Resolved: <strong>{resolved.name || resolved.ticker}</strong> (CIK {resolved.cik})
            </span>
          )}
          {error && <div className="text-red-600 mt-2">Error: {error}</div>}
        </div>

        {/* Filings list */}
        <section className="mt-6 grid md:grid-cols-2 gap-4">
          {filings.map((f, i) => (
            <article key={i} className="rounded-2xl bg-white p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{f.filed_at}</span>
                <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{f.form}</span>
              </div>
              <h3 className="mt-2 font-medium">{f.title || `${f.company} — ${f.form}`}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {f.primary_doc_url && (
                  <a className="text-sm text-blue-600 hover:underline" href={f.primary_doc_url} target="_blank">
                    Primary document
                  </a>
                )}
                {f.source_url && (
                  <a className="text-sm text-blue-600 hover:underline" href={f.source_url} target="_blank">
                    Filing index
                  </a>
                )}
              </div>
              {Array.isArray(f.badges) && f.badges.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {f.badges.map((b, j) => (
                    <span key={j} className="text-[11px] rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
          {!loadingFilings && filings.length === 0 && !error && (
            <div className="text-sm text-gray-600">Type a company/ticker to see filings.</div>
          )}
        </section>
      </div>
    </main>
  );
}
