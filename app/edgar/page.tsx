"use client";

import { useEffect, useMemo, useState } from "react";

type Filing = {
  cik: string;
  company: string;
  form: string;
  filed_at: string;
  title: string;
  index_url: string;
  primary_doc_url: string | null;
  owner_names?: string[];
};

type ApiResp = {
  meta: { cik: string; company: string; total: number; page: number; pageSize: number; pageCount: number };
  data: Filing[];
};

const FORM_OPTIONS = [
  // Core
  "8-K", "10-Q", "10-K", "S-1", "6-K", "20-F",
  // Ownership / insider
  "3", "4", "5",
  // Beneficial ownership
  "13D", "13G", "13F",
  // Prospectus family
  "424B",
];

const PAGE_SIZES = [10, 25, 50];

export default function EdgarPage() {
  const [query, setQuery] = useState(""); // ticker/company/CIK
  const [suggest, setSuggest] = useState<{ name: string; ticker: string; cik: string }[]>([]);
  const [resolved, setResolved] = useState<{ cik: string; company?: string } | null>(null);

  // Filters
  const [formSet, setFormSet] = useState<string[]>([]);
  const [owner, setOwner] = useState(""); // insider name filter (3/4/5)
  const [start, setStart] = useState(""); // YYYY-MM-DD
  const [end, setEnd] = useState("");     // YYYY-MM-DD
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);

  // Data
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ApiResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Suggestions as user types
  async function onType(v: string) {
    setQuery(v);
    setError(null);
    setResp(null);
    setPage(1);
    if (!v.trim()) return setSuggest([]);
    try {
      const r = await fetch(`/api/suggest?q=${encodeURIComponent(v)}&limit=8`, { cache: "no-store" });
      const j = await r.json();
      setSuggest(Array.isArray(j) ? j : []);
    } catch {
      setSuggest([]);
    }
  }

  // Resolve query → CIK
  async function resolveAndLoad(resetPage = true) {
    try {
      setLoading(true); setError(null);
      if (resetPage) setPage(1);
      let cik10 = "";

      // If the user clicked a suggestion previously, it’s in resolved
      if (resolved?.cik) {
        cik10 = resolved.cik;
      } else {
        const r = await fetch(`/api/lookup/${encodeURIComponent(query)}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Company not found");
        cik10 = j.cik;
        setResolved({ cik: j.cik, company: j.name });
      }

      const qs = new URLSearchParams();
      if (formSet.length) qs.set("forms", formSet.join(","));
      if (owner.trim()) qs.set("owner", owner.trim());
      if (start) qs.set("start", start);
      if (end) qs.set("end", end);
      qs.set("pageSize", String(pageSize));
      qs.set("page", String(page));

      const r2 = await fetch(`/api/filings/${encodeURIComponent(cik10)}?${qs.toString()}`, { cache: "no-store" });
      const j2 = await r2.json();
      if (!r2.ok) throw new Error(j2?.error || "Failed to fetch filings");
      setResp(j2);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  // When page/pageSize/filters change and we already have a resolved CIK, refetch
  useEffect(() => {
    if (resolved?.cik) {
      void resolveAndLoad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, formSet.join(","), owner, start, end]);

  const hasData = (resp?.data?.length || 0) > 0;

  // UI helpers
  function toggleForm(f: string) {
    setPage(1);
    setFormSet((prev) => (prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]));
  }

  function resetFilters() {
    setFormSet([]);
    setOwner("");
    setStart("");
    setEnd("");
    setPageSize(25);
    setPage(1);
  }

  const headerSubtitle = useMemo(() => {
    if (!resp?.meta) return "";
    const parts = [
      `CIK ${resp.meta.cik}`,
      resp.meta.company ? `• ${resp.meta.company}` : "",
      resp.meta.total ? `• ${resp.meta.total} results` : "",
    ].filter(Boolean);
    return parts.join(" ");
  }, [resp]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">EDGAR Filings</h1>
        <p className="text-gray-600 text-sm">{headerSubtitle || "Search by ticker (NVDA), company (NVIDIA), or CIK."}</p>
      </header>

      {/* Search + Suggest */}
      <div className="relative max-w-xl">
        <input
          value={query}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setResolved(null); resolveAndLoad(); } }}
          placeholder="Try NVDA, NVIDIA, BRK.B or a 10-digit CIK…"
          className="w-full rounded-xl border px-3 py-2"
        />
        {!!suggest.length && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border bg-white shadow">
            {suggest.map((s, i) => (
              <button
                key={i}
                className="w-full text-left px-3 py-2 hover:bg-gray-50"
                onClick={() => {
                  setQuery(`${s.ticker} — ${s.name}`);
                  setSuggest([]);
                  setResolved({ cik: s.cik, company: s.name });
                  setPage(1);
                  void resolveAndLoad();
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.ticker}</span>
                  <span className="text-xs text-gray-500">{s.cik}</span>
                </div>
                <div className="text-xs text-gray-600">{s.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <section className="mt-4 rounded-2xl border bg-white p-4">
        <div className="grid md:grid-cols-2 gap-4">
          {/* Left column: form types & insider */}
          <div>
            <div className="text-sm font-medium mb-2">Form types</div>
            <div className="flex flex-wrap gap-2">
              {FORM_OPTIONS.map((f) => (
                <button
                  key={f}
                  className={`text-xs rounded-full px-3 py-1 border ${
                    formSet.includes(f) ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"
                  }`}
                  onClick={() => toggleForm(f)}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className="text-sm text-gray-700">Filter by insider (Forms 3/4/5):</label>
              <input
                value={owner}
                onChange={(e) => { setOwner(e.target.value); setPage(1); }}
                placeholder="e.g., Jensen Huang"
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
              <div className="text-xs text-gray-500 mt-1">We’ll match reporting owner names in 3/4/5 XML.</div>
            </div>
          </div>

          {/* Right column: dates & pagination */}
          <div className="grid sm:grid-cols-2 gap-3">
            <label>
              <div className="text-sm text-gray-700">Start date</div>
              <input
                type="date"
                value={start}
                onChange={(e) => { setStart(e.target.value); setPage(1); }}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </label>
            <label>
              <div className="text-sm text-gray-700">End date</div>
              <input
                type="date"
                value={end}
                onChange={(e) => { setEnd(e.target.value); setPage(1); }}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </label>
            <label>
              <div className="text-sm text-gray-700">Results per page</div>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(parseInt(e.target.value)); setPage(1); }}
                className="mt-1 w-full rounded-md border px-3 py-2"
              >
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                onClick={() => { setResolved(null); resolveAndLoad(); }}
                className="w-full rounded-md bg-black text-white px-3 py-2 disabled:opacity-60"
                disabled={loading || !query.trim()}
              >
                {loading ? "Getting…" : "Get filings"}
              </button>
              <button
                onClick={resetFilters}
                className="whitespace-nowrap rounded-md border px-3 py-2 text-sm"
                disabled={loading}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Errors */}
      {error && <div className="mt-3 text-sm text-red-600">Error: {error}</div>}

      {/* Results */}
      <section className="mt-6">
        {!loading && resp && !hasData && (
          <div className="text-sm text-gray-600">No filings match your filters.</div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {(resp?.data || []).map((f, i) => (
            <article key={`${f.index_url}-${i}`} className="rounded-2xl bg-white p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{f.filed_at}</span>
                <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{f.form}</span>
              </div>
              <h3 className="mt-2 font-medium">{f.title}</h3>

              {/* Insider owners if present */}
              {f.owner_names && f.owner_names.length > 0 && (
                <div className="mt-2 text-xs text-gray-700">
                  Owners: {f.owner_names.join(", ")}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <a className="text-sm text-blue-600 underline" href={f.index_url} target="_blank" rel="noreferrer">
                  Filing Index
                </a>
                {f.primary_doc_url && (
                  <>
                    <a className="text-sm text-blue-600 underline" href={f.primary_doc_url} target="_blank" rel="noreferrer">
                      Primary Doc
                    </a>
                    {/* “Download” – browsers will usually download if target is not HTML; if HTML, it will open. */}
                    <a
                      className="text-sm rounded-md border px-2 py-1"
                      href={f.primary_doc_url}
                      target="_blank"
                      rel="noreferrer"
                      download
                    >
                      Download
                    </a>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>

        {/* Pagination */}
        {resp?.meta?.pageCount && resp.meta.pageCount > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              ← Prev
            </button>

            <span className="text-sm text-gray-700">
              Page <strong>{resp.meta.page}</strong> of <strong>{resp.meta.pageCount}</strong>
            </span>

            <button
              className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
              disabled={page >= (resp.meta.pageCount || 1) || loading}
              onClick={() => setPage(p => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </section>

      {/* Footer disclosure */}
      <footer className="mt-10 text-center text-xs text-gray-500">
        This site republishes SEC EDGAR filings and BLS data.
      </footer>
    </main>
  );
}
