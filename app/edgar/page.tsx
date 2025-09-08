// app/edgar/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Suggest = { cik: string; ticker: string; name: string };
type FilingRow = {
  cik: string;
  company: string;
  form: string;
  filed_at: string;
  accession: string;
  primary_doc: string | null;
  links: { index: string; primary_doc: string | null; full_txt: string };
};

const ALL_FORMS = [
  "8-K","10-Q","10-K","6-K","S-1","S-3","S-4","424B1","424B2","424B3","424B4",
  "13D","13G","SC 13D","SC 13G","SD","SD/A",
  "3","4","5",
  "20-F","40-F","F-1","F-3","F-4",
  "DEF 14A","DEFA14A","PX14A6G","PX14A6N",
  "8-A12B","8-A12G","POS AM","POS EX","RW"
];

export default function EdgarPage() {
  // search
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState<Suggest[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [resolved, setResolved] = useState<{ cik: string; name: string } | null>(null);

  // filters
  const [forms, setForms] = useState<string[]>([]);
  const [insider, setInsider] = useState("");
  const [start, setStart] = useState("1999-01-01");
  const [end, setEnd] = useState("");

  // results
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<FilingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const boxRef = useRef<HTMLDivElement>(null);

  // Suggest dropdown
  useEffect(() => {
    let alive = true;
    async function go() {
      const term = q.trim();
      if (!term) { setSuggest([]); return; }
      try {
        const r = await fetch(`/api/lookup/${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        setSuggest(Array.isArray(j.data) ? j.data : []);
      } catch {
        if (alive) setSuggest([]);
      }
    }
    const t = setTimeout(go, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  // Close suggest when clicking outside
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as any)) setShowSuggest(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function onPick(s: Suggest) {
    setQ(`${s.ticker || s.name}`);
    setResolved({ cik: s.cik, name: s.name });
    setShowSuggest(false);
    setRows([]); setTotal(0); setPage(1);
  }

  async function resolveIfNeeded() {
    // If user typed a 10-digit CIK, use it
    const onlyDigits = q.replace(/\D/g, "");
    if (onlyDigits.length === 10) {
      setResolved({ cik: onlyDigits, name: "" });
      return { cik: onlyDigits };
    }
    // else call lookup and pick first match
    const r = await fetch(`/api/lookup/${encodeURIComponent(q.trim())}`, { cache: "no-store" });
    const j = await r.json();
    const first = (j?.data || [])[0];
    if (!first) throw new Error("Ticker/Company not recognized.");
    setResolved({ cik: first.cik, name: first.name });
    return { cik: first.cik };
  }

  async function getFilings(nextPage = 1) {
    setThinking(true); // show “thinking…” immediately
    setLoading(true);
    setError(null);

    try {
      const { cik } = resolved || (await resolveIfNeeded());
      const qs = new URLSearchParams();
      if (start) qs.set("start", start);
      if (end) qs.set("end", end);
      if (forms.length > 0) qs.set("forms", forms.join(","));
      if (insider.trim()) qs.set("insider", insider.trim());
      qs.set("page", String(nextPage));
      qs.set("pageSize", String(pageSize));

      const r = await fetch(`/api/filings/${cik}?` + qs.toString(), { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Fetch failed");

      setRows(j.data || []);
      setTotal(j.total || 0);
      setPage(j.page || nextPage);
    } catch (e: any) {
      setError(e?.message || "Error");
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
      setThinking(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const selectedFormsSet = useMemo(() => new Set(forms), [forms]);

  function toggleForm(ft: string) {
    setForms((prev) =>
      selectedFormsSet.has(ft)
        ? prev.filter((f) => f !== ft)
        : [...prev, ft]
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">EDGAR Filings</h1>
          <p className="text-gray-600 text-sm mt-1">
            Search by <strong>ticker/company</strong> or 10-digit <strong>CIK</strong>. Filter by form types, insider name and date range.
          </p>
        </header>

        {/* Search + suggestions */}
        <div ref={boxRef} className="relative mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setShowSuggest(true); }}
              onFocus={() => setShowSuggest(true)}
              placeholder="Ticker (NVDA), Company (NVIDIA), or CIK (0001045810)"
              className="border bg-white rounded-xl px-3 py-2 w-80"
            />
            <button
              onClick={() => getFilings(1)}
              className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-60"
              disabled={loading}
              title="Get filings"
            >
              {loading ? "Getting…" : "Get filings"}
            </button>
            {thinking && <span className="text-xs text-gray-500">Thinking…</span>}
            {resolved && (
              <span className="text-xs text-gray-600">
                Resolved CIK: <code>{resolved.cik}</code>
              </span>
            )}
          </div>
          {showSuggest && suggest.length > 0 && (
            <div className="absolute z-20 mt-1 w-96 rounded-md border bg-white shadow">
              {suggest.map((s) => (
                <button
                  key={s.cik + s.ticker}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50"
                  onClick={() => onPick(s)}
                >
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-gray-600">{s.ticker} • CIK {s.cik}</div>
                </button>
              ))}
            </div>
          )}
          {showSuggest && suggest.length === 0 && q.trim() && (
            <div className="absolute z-20 mt-1 w-96 rounded-md border bg-white shadow px-3 py-2 text-sm text-gray-600">
              No matches
            </div>
          )}
        </div>

        {/* Filters */}
        <section className="rounded-2xl border bg-white p-4 mb-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-700 mb-1">Insider (forms 3/4/5)</div>
              <input
                value={insider}
                onChange={(e) => setInsider(e.target.value)}
                placeholder="e.g., Jensen Huang"
                className="border rounded-md px-3 py-2 w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <div className="text-sm text-gray-700 mb-1">Start date</div>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="border rounded-md px-3 py-2 w-full"
                />
              </label>
              <label>
                <div className="text-sm text-gray-700 mb-1">End date</div>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="border rounded-md px-3 py-2 w-full"
                />
              </label>
            </div>
            <div>
              <div className="text-sm text-gray-700 mb-1">Results per page</div>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(parseInt(e.target.value)); setPage(1); }}
                className="border rounded-md px-3 py-2 w-full"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm text-gray-700 mb-2">Form Types</div>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-auto border rounded-md p-2">
              {ALL_FORMS.map((ft) => {
                const sel = selectedFormsSet.has(ft);
                return (
                  <button
                    key={ft}
                    onClick={() => toggleForm(ft)}
                    className={`text-xs rounded-full px-3 py-1 border ${sel ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"}`}
                  >
                    {ft}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Error */}
        {error && <div className="text-red-600 text-sm mb-3">Error: {error}</div>}

        {/* Results */}
        <section className="rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-700">
              {total > 0 ? `Showing ${rows.length} of ${total}` : "No results yet"}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => getFilings(Math.max(1, page - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1 rounded-md border disabled:opacity-60"
                >
                  Prev
                </button>
                <span className="text-sm">Page {page} / {totalPages}</span>
                <button
                  onClick={() => getFilings(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages || loading}
                  className="px-3 py-1 rounded-md border disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {rows.map((r, i) => (
              <article key={r.accession + i} className="rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{r.filed_at}</span>
                  <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{r.form}</span>
                </div>
                <h3 className="mt-2 font-medium">
                  {r.company} • {r.form}
                </h3>
                <div className="mt-2 text-xs text-gray-600 break-all">
                  Accession: {r.accession}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <a href={r.links.index} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-1 hover:bg-gray-50">
                    Open Index
                  </a>
                  {r.links.primary_doc && (
                    <a href={r.links.primary_doc} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-1 hover:bg-gray-50">
                      Primary Doc
                    </a>
                  )}
                  <a href={r.links.full_txt} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-1 hover:bg-gray-50">
                    Full Text
                  </a>
                </div>
              </article>
            ))}
          </div>

          {/* Load / Empty messaging */}
          {!loading && rows.length === 0 && (
            <div className="text-sm text-gray-600">
              Enter a company/ticker, set filters, then press “Get filings”.
            </div>
          )}
          {loading && (
            <div className="text-sm text-gray-600 mt-3">Loading filings…</div>
          )}
        </section>

        {/* Footer note */}
        <footer className="text-center text-xs text-gray-500 mt-6">
          This site republishes SEC EDGAR filings and BLS data.
        </footer>
      </div>
    </main>
  );
}