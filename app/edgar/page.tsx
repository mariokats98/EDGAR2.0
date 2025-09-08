"use client";

import { useEffect, useMemo, useState } from "react";
import InsiderInput from "./InsiderInput";

type Filing = {
  cik: string;
  company: string;
  form: string;
  filed_at: string;
  title: string;
  source_url: string | null;       // folder index
  primary_doc_url: string | null;  // actual doc
  amount_usd?: number | null;
  items?: string[];
  badges?: string[];
};

const ALL_FORMS = [
  "8-K","10-Q","10-K","6-K","S-1","S-3","S-4","S-8","424B1","424B2","424B3","424B4",
  "13D","13G","SC 13D","SC 13G","13F","11-K","20-F","40-F","F-1","F-3","F-4",
  "3","4","5"
];

export default function EdgarPage() {
  // ----------------------------------
  // Inputs / filters
  // ----------------------------------
  const [query, setQuery] = useState("");
  const [resolvedCik, setResolvedCik] = useState<string>("");
  const [insiderName, setInsiderName] = useState<string>("");

  const [start, setStart] = useState<string>("2018-01-01");
  const [end, setEnd] = useState<string>("");

  // Forms: if insider chosen, we lock to 3/4/5
  const [forms, setForms] = useState<string[]>(["8-K","10-Q","10-K","3","4","5"]);
  const insiderMode = insiderName.trim().length > 0;

  // pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // data + status
  const [loading, setLoading] = useState(false);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [error, setError] = useState<string | null>(null);

  // keep forms locked when insider mode toggles on
  useEffect(() => {
    if (insiderMode) {
      setForms(["3","4","5"]);
    }
  }, [insiderMode]);

  // Resolve query → CIK
  async function resolveCik(input: string): Promise<string> {
    const trimmed = (input || "").trim();
    // Allow raw 10-digit CIK
    if (/^\d{10}$/.test(trimmed)) return trimmed;

    // Try ticker/company via lookup
    const r = await fetch(`/api/lookup/${encodeURIComponent(trimmed)}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || !j?.cik) {
      throw new Error(j?.error || "Ticker/Company not recognized");
    }
    return String(j.cik).padStart(10, "0");
  }

  // Build query string for filings API
  function buildFilingsUrl(cik10: string) {
    const params = new URLSearchParams();
    if (forms.length) params.set("form", forms.join(","));
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    if (insiderMode) params.set("insider", insiderName.trim());
    return `/api/filings/${cik10}?${params.toString()}`;
  }

  // Fetch handler
  async function getFilings() {
    setError(null);
    setFilings([]);
    setLoading(true);
    setPage(1); // reset pagination on each fetch
    try {
      const cik10 = await resolveCik(query || resolvedCik);
      setResolvedCik(cik10);

      const url = buildFilingsUrl(cik10);
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch filings");

      // expect array of filings
      setFilings(Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : []);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  // Client-side filtering (defensive; server should already filter by form/dates)
  const filtered = useMemo(() => {
    const out = filings.filter((f) => {
      if (forms.length && !forms.some(ft => f.form?.toUpperCase().startsWith(ft.toUpperCase()))) {
        return false;
      }
      if (start && f.filed_at && f.filed_at < start) return false;
      if (end && f.filed_at && f.filed_at > end) return false;
      if (insiderMode) {
        // If API added a lightweight text search in the doc, we could further filter here.
        // For now we trust backend filtering when insider param is present.
      }
      return true;
    });

    // Sort newest → oldest by date then accession implied by index
    out.sort((a, b) => (b.filed_at || "").localeCompare(a.filed_at || ""));
    return out;
  }, [filings, forms, start, end, insiderMode]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const visible = filtered.slice((page - 1) * perPage, page * perPage);

  // UI helpers
  function toggleForm(form: string) {
    if (insiderMode) return; // locked to 3/4/5 while insider is selected
    setForms(prev =>
      prev.includes(form) ? prev.filter(f => f !== form) : [...prev, form]
    );
  }

  function resetAll() {
    setQuery("");
    setResolvedCik("");
    setInsiderName("");
    setForms(["8-K","10-Q","10-K","3","4","5"]);
    setStart("2018-01-01");
    setEnd("");
    setPerPage(10);
    setFilings([]);
    setError(null);
    setPage(1);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">EDGAR Filings</h1>
          <p className="text-gray-600 text-sm mt-1">
            Enter a <strong>Ticker</strong> (AAPL/BRK.B), <strong>Company</strong> (APPLE), or <strong>CIK</strong> (10 digits).
            Optionally pick an <strong>Insider</strong> — the form filter will snap to Forms 3, 4, 5.
          </p>
        </header>

        {/* Search row */}
        <div className="rounded-2xl border bg-white p-4 mb-4">
          <div className="grid md:grid-cols-[1fr_1fr] gap-3">
            <label className="flex flex-col">
              <span className="text-sm text-gray-700 mb-1">Company / Ticker / CIK</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g., NVDA or NVIDIA or 0000320193"
                className="border bg-white rounded-md px-3 py-2"
              />
            </label>

            <div className="flex flex-col">
              <span className="text-sm text-gray-700 mb-1">Insider (Forms 3/4/5)</span>
              <InsiderInput
                onSelect={(name) => {
                  setInsiderName(name);
                  // auto-lock forms to 3/4/5
                  setForms(["3", "4", "5"]);
                }}
              />
              {insiderMode && (
                <div className="text-xs text-gray-500 mt-1">
                  Insider selected: <strong>{insiderName}</strong> • Form filter locked to 3/4/5.
                  <button
                    className="ml-2 underline"
                    onClick={() => {
                      setInsiderName("");
                      setForms(["8-K","10-Q","10-K","3","4","5"]);
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="mt-4 grid md:grid-cols-[1fr_1fr] gap-3">
            {/* Date range */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700">
                Start date
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="block border rounded-md px-3 py-2 mt-1"
                />
              </label>
              <label className="text-sm text-gray-700">
                End date
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="block border rounded-md px-3 py-2 mt-1"
                />
              </label>
            </div>

            {/* Forms */}
            <div>
              <div className="text-sm text-gray-700 mb-1">Form types</div>
              <div className={`flex flex-wrap gap-2 ${insiderMode ? "opacity-60 pointer-events-none" : ""}`}>
                {ALL_FORMS.map((f) => {
                  const on = forms.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleForm(f)}
                      className={`text-xs rounded-full px-3 py-1 border ${
                        on ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"
                      }`}
                      title={f}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
              {insiderMode && (
                <div className="text-xs text-gray-500 mt-1">
                  Form picker is disabled while an insider is selected.
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={getFilings}
              className="rounded-md bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Getting…" : "Get filings"}
            </button>

            {/* per-page + pagination */}
            <label className="text-sm text-gray-700 ml-auto">
              Results per page
              <select
                value={perPage}
                onChange={(e) => { setPerPage(parseInt(e.target.value)); setPage(1); }}
                className="ml-2 border rounded-md px-2 py-1"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1 border rounded disabled:opacity-50"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Prev
              </button>
              <span className="text-sm text-gray-700">
                Page {page} / {totalPages}
              </span>
              <button
                className="px-3 py-1 border rounded disabled:opacity-50"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>

            <button onClick={resetAll} className="text-sm underline">
              Reset
            </button>
          </div>

          {resolvedCik && (
            <div className="text-xs text-gray-500 mt-2">
              Resolved CIK: <code>{resolvedCik}</code>
            </div>
          )}
        </div>

        {/* Errors */}
        {error && <div className="text-red-600 text-sm mb-4">Error: {error}</div>}

        {/* Results */}
        <section className="grid md:grid-cols-2 gap-4">
          {visible.map((f, i) => (
            <article key={`${f.filed_at}-${i}`} className="rounded-2xl bg-white p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{f.filed_at}</span>
                <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{f.form}</span>
              </div>

              <h3 className="mt-2 font-medium">{f.title || `${f.company} • ${f.form}`}</h3>

              {/* quick badges */}
              <div className="mt-2 flex flex-wrap gap-2">
                {(f.badges || []).map((b, idx) => (
                  <span key={idx} className="text-[11px] rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">
                    {b}
                  </span>
                ))}
                {Number.isFinite(f.amount_usd) && (
                  <span className="text-[11px] rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5">
                    ${Math.round((f.amount_usd || 0)).toLocaleString()}
                  </span>
                )}
              </div>

              {/* download / open */}
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {f.primary_doc_url && (
                  <a
                    className="rounded-md border px-3 py-1 hover:bg-gray-50"
                    href={f.primary_doc_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download primary
                  </a>
                )}
                {f.source_url && (
                  <a
                    className="rounded-md border px-3 py-1 hover:bg-gray-50"
                    href={f.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Filing folder
                  </a>
                )}
              </div>
            </article>
          ))}
        </section>

        {/* Empty state */}
        {!loading && visible.length === 0 && (
          <div className="text-sm text-gray-600 mt-6">
            No results yet. Enter a company/ticker/CIK (and optionally an insider), then click <strong>Get filings</strong>.
          </div>
        )}
      </div>
    </main>
  );
}