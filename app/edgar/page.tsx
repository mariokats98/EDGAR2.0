"use client";

import { useEffect, useMemo, useState } from "react";

// A broad but concise set of commonly-used SEC forms (you can extend this list anytime)
const FORM_OPTIONS = [
  // Core periodic & current
  "10-K","10-K/A","10-Q","10-Q/A","8-K","8-K/A","6-K",
  // Registration / prospectus
  "S-1","S-1/A","S-3","S-3/A","S-4","S-4/A","424B1","424B2","424B3","424B4","424B5","424B7","424B8",
  // Foreign issuers
  "20-F","20-F/A","40-F","40-F/A","F-1","F-1/A","F-3","F-3/A","F-4","F-4/A",
  // Ownership/insider
  "3","4","5","3/A","4/A","5/A",
  // Schedule 13s
  "SC 13D","SC 13D/A","SC 13G","SC 13G/A",
  // Proxy/Information statements
  "DEF 14A","DEFA14A","PRE 14A","PRER14A","DEFM14A","DFAN14A",
  // Others often requested
  "11-K","11-K/A","15-12B","15-12G","15-15D","144","S-8","S-8/A",
  // Investment company common
  "N-CSR","N-CSRS","N-CEN","N-Q","N-PORT","N-PORT-P","N-PORT-EX","N-1A","N-2"
];

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

export default function EdgarPage() {
  // Inputs
  const [query, setQuery] = useState("");
  const [resolvedCik, setResolvedCik] = useState<string>("");
  const [forms, setForms] = useState<string[]>([]);
  const [start, setStart] = useState<string>(""); // YYYY-MM-DD
  const [end, setEnd] = useState<string>("");     // YYYY-MM-DD

  // Paging
  const [limit, setLimit] = useState<number>(10);
  const [offset, setOffset] = useState<number>(0);

  // Data
  const [rows, setRows] = useState<Filing[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Multi-select dropdown UI
  const [openForms, setOpenForms] = useState(false);

  // Resolve query → CIK using your /api/lookup/[symbol]
  async function resolveCIK(q: string): Promise<string> {
    const r = await fetch(`/api/lookup/${encodeURIComponent(q)}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "Lookup failed");
    // Expect j to be like { kind: "cik"|"ticker"|"name", cik: "...", ... }
    const cik = j?.cik || j?.value || "";
    if (!cik) throw new Error("Ticker/Company not recognized");
    return cik;
  }

  async function fetchFilings(resetPage = true) {
    try {
      setLoading(true);
      setErr(null);
      if (!query.trim() && !resolvedCik) throw new Error("Enter a ticker, company name, or CIK");

      const cik = resolvedCik || (await resolveCIK(query.trim()));
      if (resetPage) setOffset(0);
      setResolvedCik(cik);

      const params = new URLSearchParams();
      if (forms.length) params.set("forms", forms.join(","));
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      params.set("limit", String(limit));
      params.set("offset", String(resetPage ? 0 : offset));

      const r = await fetch(`/api/filings/${cik}?${params.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch filings");
      setRows(Array.isArray(j.data) ? j.data : []);
      setTotal(Number(j.total || 0));
    } catch (e: any) {
      setErr(e?.message || "Error");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  // Pagination handlers
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  async function nextPage() {
    if (!canNext) return;
    setOffset((o) => o + limit);
    // re-fetch with new offset
    const cik = resolvedCik || (query.trim() ? await resolveCIK(query.trim()) : "");
    if (!cik) return;
    const params = new URLSearchParams();
    if (forms.length) params.set("forms", forms.join(","));
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    params.set("limit", String(limit));
    params.set("offset", String(offset + limit));
    const r = await fetch(`/api/filings/${cik}?${params.toString()}`, { cache: "no-store" });
    const j = await r.json();
    if (r.ok) {
      setRows(Array.isArray(j.data) ? j.data : []);
      setTotal(Number(j.total || 0));
    } else {
      setErr(j?.error || "Error");
    }
  }

  async function prevPage() {
    if (!canPrev) return;
    setOffset((o) => Math.max(0, o - limit));
    const cik = resolvedCik || (query.trim() ? await resolveCIK(query.trim()) : "");
    if (!cik) return;
    const params = new URLSearchParams();
    if (forms.length) params.set("forms", forms.join(","));
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    params.set("limit", String(limit));
    params.set("offset", String(Math.max(0, offset - limit)));
    const r = await fetch(`/api/filings/${cik}?${params.toString()}`, { cache: "no-store" });
    const j = await r.json();
    if (r.ok) {
      setRows(Array.isArray(j.data) ? j.data : []);
      setTotal(Number(j.total || 0));
    } else {
      setErr(j?.error || "Error");
    }
  }

  const pageInfo = useMemo(() => {
    if (!total) return "0";
    const from = Math.min(total, offset + 1);
    const to = Math.min(total, offset + rows.length);
    return `${from}–${to} of ${total}`;
  }, [rows, offset, total]);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">EDGAR Filings</h1>
          <p className="text-gray-600 text-sm mt-1">
            Search a <strong>Ticker</strong> (AAPL), <strong>Company</strong> (APPLE), or <strong>CIK</strong> (10 digits).  
            The results include both the SEC “recent” set and all yearly archive files.
          </p>
        </header>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <label className="flex-1 min-w-[240px]">
            <div className="text-sm text-gray-700">Company / Ticker / CIK</div>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setResolvedCik(""); }}
              placeholder="e.g., NVDA or NVIDIA"
              className="border rounded-md w-full px-3 py-2"
            />
          </label>

          {/* Form Types Multi-select */}
          <div className="relative">
            <div className="text-sm text-gray-700">Form Types</div>
            <button
              type="button"
              onClick={() => setOpenForms((v) => !v)}
              className="border rounded-md px-3 py-2 w-64 text-left bg-white"
            >
              {forms.length ? `${forms.length} selected` : "Pick one or more"}
            </button>
            {openForms && (
              <div
                className="absolute z-10 mt-1 max-h-72 w-72 overflow-auto rounded-md border bg-white p-2 shadow"
                onMouseLeave={() => setOpenForms(false)}
              >
                <div className="flex items-center justify-between mb-2">
                  <button
                    className="text-xs rounded bg-gray-100 px-2 py-1"
                    onClick={() => setForms([...FORM_OPTIONS])}
                  >
                    Select all
                  </button>
                  <button
                    className="text-xs rounded bg-gray-100 px-2 py-1"
                    onClick={() => setForms([])}
                  >
                    Clear
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {FORM_OPTIONS.map((f) => {
                    const checked = forms.includes(f);
                    return (
                      <label key={f} className="flex items-center gap-2 text-sm px-1 py-0.5 rounded hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setForms((prev) =>
                              checked ? prev.filter((x) => x !== f) : [...prev, f]
                            );
                          }}
                        />
                        <span>{f}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <label>
            <div className="text-sm text-gray-700">Start (YYYY-MM-DD)</div>
            <input
              value={start}
              onChange={(e) => setStart(e.target.value)}
              placeholder="2008-01-01"
              className="border rounded-md px-3 py-2 w-40"
            />
          </label>

          <label>
            <div className="text-sm text-gray-700">End (YYYY-MM-DD)</div>
            <input
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              placeholder="2025-12-31"
              className="border rounded-md px-3 py-2 w-40"
            />
          </label>

          <label>
            <div className="text-sm text-gray-700">Per page</div>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="border rounded-md px-3 py-2 w-28"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>

          <button
            onClick={() => fetchFilings(true)}
            disabled={loading}
            className="rounded-md bg-black text-white px-4 py-2"
          >
            {loading ? "Getting…" : "Get filings"}
          </button>
        </div>

        {/* Errors */}
        {err && <div className="text-red-600 text-sm mb-3">Error: {err}</div>}

        {/* Results */}
        <section className="rounded-2xl border bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">
              {total ? `Showing ${pageInfo}` : "No results yet."}
              {resolvedCik && <span className="ml-2 text-gray-500">CIK: {resolvedCik}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={prevPage}
                disabled={!canPrev || loading}
                className="rounded border px-3 py-1 text-sm disabled:opacity-50"
              >
                ← Prev
              </button>
              <button
                onClick={nextPage}
                disabled={!canNext || loading}
                className="rounded border px-3 py-1 text-sm disabled:opacity-50"
              >
                Next →
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {rows.map((r, i) => (
              <article key={`${r.accession}-${i}`} className="rounded-lg border p-3 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{r.filed}</span>
                  <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{r.form}</span>
                </div>
                <h3 className="mt-1 font-medium">{r.title}</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <a
                    href={r.index_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-black text-white px-3 py-1"
                    title="Open primary document"
                  >
                    View filing
                  </a>
                  <a
                    href={r.archive_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border px-3 py-1"
                    title="Open accession folder"
                  >
                    Archive folder
                  </a>
                  <a
                    href={r.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border px-3 py-1"
                    title="Download primary doc"
                  >
                    Download
                  </a>
                </div>
              </article>
            ))}
          </div>

          {!loading && rows.length === 0 && (
            <div className="text-sm text-gray-600 py-8 text-center">
              No filings found. Try removing date/form filters or check your search.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}