// app/edgar/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Suggest = { cik: string; ticker: string; name: string };
type Filing = {
  form: string;
  filed: string;
  accession: string;
  title: string;
  index_url: string;
  archive_url: string;
  primary_doc: string | null;
  download_url: string;
};

const FORM_OPTIONS = [
  "8-K","10-Q","10-K","S-1","S-3","S-8","424B2","424B3","424B4",
  "13D","13G","SC 13D","SC 13G","6-K","20-F","F-1","F-3","F-4",
  "3","4","5","11-K"
];

export default function EdgarPage() {
  // query & suggestions
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggest[]>([]);
  const [active, setActive] = useState<Suggest | null>(null);
  const [sOpen, setSOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // filters & results
  const [selectedForms, setSelectedForms] = useState<string[]>([]);
  const [start, setStart] = useState(""); // YYYY-MM-DD
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Filing[]>([]);
  const [error, setError] = useState<string | null>(null);

  // pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  // close suggestions when clicking outside
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setSOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // debounced suggest fetch
  useEffect(() => {
    if (!query) {
      setSuggestions([]);
      setSOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(query)}`);
        if (r.ok) {
          const j = await r.json();
          setSuggestions(j);
          setSOpen(true);
        }
      } catch {}
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  async function resolveAndFetch(pageNum = 1) {
    try {
      setLoading(true);
      setError(null);
      setRows([]);

      let cik = active?.cik || "";
      if (!cik) {
        // Resolve: user typed something but didn’t click a suggestion
        const r = await fetch(`/api/lookup/${encodeURIComponent(query)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Lookup failed");
        cik = j.cik;
        // set active for future pages
        setActive({ cik, ticker: j.ticker || "", name: j.name || "" });
      }

      const offset = (pageNum - 1) * perPage;
      const params = new URLSearchParams({
        limit: String(perPage),
        offset: String(offset),
      });
      if (selectedForms.length) params.set("forms", selectedForms.join(","));
      if (start) params.set("start", start);
      if (end) params.set("end", end);

      const f = await fetch(`/api/filings/${cik}?${params.toString()}`, { cache: "no-store" });
      const fj = await f.json();
      if (!f.ok) throw new Error(fj?.error || "Failed to get filings");

      setRows(Array.isArray(fj.data) ? fj.data : []);
      setTotal(Number(fj.total || 0));
      setPage(pageNum);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  const pages = useMemo(() => {
    const n = Math.ceil(total / perPage);
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [total, perPage]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">EDGAR Filings</h1>
          <p className="text-gray-600 text-sm mt-1">
            Type a <strong>ticker</strong> (NVDA/BRK.B) or <strong>company</strong> (NVIDIA), pick from suggestions, then “Get filings”.
          </p>
        </header>

        {/* Search + suggestions */}
        <div className="flex flex-wrap items-center gap-2 mb-4" ref={boxRef}>
          <div className="relative w-80">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(null);
              }}
              onFocus={() => suggestions.length && setSOpen(true)}
              placeholder="Ticker or Company…"
              className="border bg-white rounded-xl px-3 py-2 w-full"
            />
            {sOpen && suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow">
                {suggestions.map((s) => (
                  <li
                    key={s.cik}
                    className="px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
                    onClick={() => {
                      setQuery(`${s.ticker} — ${s.name}`);
                      setActive(s);
                      setSOpen(false);
                    }}
                  >
                    <span className="font-medium">{s.ticker}</span>{" "}
                    <span className="text-gray-600">— {s.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={() => resolveAndFetch(1)}
            className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-60"
            disabled={loading || (!query && !active)}
          >
            {loading ? "Getting…" : "Get filings"}
          </button>
        </div>

        {/* Filters */}
        <div className="rounded-2xl border bg-white p-4 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <div className="text-sm text-gray-700">Form types</div>
              <select
                multiple
                value={selectedForms}
                onChange={(e) => {
                  const options = Array.from(e.target.selectedOptions).map((o) => o.value);
                  setSelectedForms(options);
                }}
                className="border rounded-md px-3 py-2 min-w-[12rem] h-28"
              >
                {FORM_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <div className="text-sm text-gray-700">Start date</div>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="border rounded-md px-3 py-2"
              />
            </label>
            <label>
              <div className="text-sm text-gray-700">End date</div>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="border rounded-md px-3 py-2"
              />
            </label>
            <label>
              <div className="text-sm text-gray-700">Per page</div>
              <select
                value={perPage}
                onChange={(e) => setPerPage(parseInt(e.target.value))}
                className="border rounded-md px-3 py-2"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <button
              onClick={() => resolveAndFetch(1)}
              className="rounded-md bg-black text-white px-4 py-2 disabled:opacity-60"
              disabled={loading || !query}
            >
              Apply filters
            </button>
          </div>
        </div>

        {/* Errors */}
        {error && <div className="text-red-600 text-sm mb-3">Error: {error}</div>}

        {/* Results */}
        <section className="grid md:grid-cols-2 gap-4">
          {rows.map((f, i) => (
            <article key={i} className="rounded-2xl bg-white p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{f.filed}</span>
                <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{f.form}</span>
              </div>
              <h3 className="mt-2 font-medium">{f.title}</h3>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <a href={f.index_url} target="_blank" className="underline text-blue-600">
                  View on SEC
                </a>
                <a href={f.download_url} target="_blank" className="underline text-blue-600">
                  Download
                </a>
                <a href={f.archive_url} target="_blank" className="underline text-blue-600">
                  Archive folder
                </a>
              </div>
            </article>
          ))}
          {!loading && rows.length === 0 && (
            <div className="text-sm text-gray-600">No results yet — search above.</div>
          )}
        </section>

        {/* Pagination */}
        {pages.length > 1 && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {pages.slice(0, 12).map((p) => (
              <button
                key={p}
                onClick={() => resolveAndFetch(p)}
                className={`px-3 py-1 rounded-md border ${
                  p === page ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"
                }`}
              >
                {p}
              </button>
            ))}
            {pages.length > 12 && (
              <span className="text-xs text-gray-600">… {pages.length} pages total</span>
            )}
          </div>
        )}

        {/* Footnote */}
        <footer className="mt-8 text-xs text-gray-500">
          This site republishes SEC EDGAR filings. Data courtesy of SEC.
        </footer>
      </div>
    </main>
  );
}