"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SuggestItem = { cik: string; ticker?: string; title: string };
type FilingRow = {
  form: string;
  filingDate: string;
  reportDate?: string;
  accessionNumber: string;
  primaryDocument: string;
  title?: string;
  links: { view: string; download: string };
};
type Meta = { cik: string; name: string; page: number; pageSize: number; total: number };

const FORM_OPTIONS = [
  // core
  "10-K","10-Q","8-K","S-1","S-3","S-4","424B2","424B3","424B4","424B5","424B7","424B8",
  // ownership
  "3","4","5",
  // large holders
  "13D","13G","SC 13D","SC 13G","SC 13DA","SC 13GA",
  // foreign/private
  "6-K","20-F","F-1","F-3","F-4",
  // misc
  "DEF 14A","DEFA14A","PRE 14A","SD","11-K","13F-HR","13F-NT"
];

function normDate(d: string): string | "" {
  const s = d.trim();
  if (!s) return "";
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return `${s}-01`;
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)) return s;
  return ""; // drop bad input instead of sending it
}

/** Build absolute URL for API (avoids “Failed to parse URL from /api/…” in some environments) */
function apiUrl(path: string) {
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  // Server-render fallback (Vercel / edge compatible)
  // This runs only briefly; most fetches are client-initiated.
  return path.startsWith("http") ? path : `http://localhost:3000${path}`;
}

export default function EdgarPage() {
  // search box
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SuggestItem | null>(null);

  // suggestions
  const [sugs, setSugs] = useState<SuggestItem[]>([]);
  const [sugOpen, setSugOpen] = useState(false);
  const sugRef = useRef<HTMLDivElement>(null);

  // filters
  const [forms, setForms] = useState<string[]>(["10-K","10-Q","8-K"]);
  const [start, setStart] = useState("2019");
  const [end, setEnd] = useState("");
  const [ownerName, setOwnerName] = useState(""); // for 3/4/5 refinement (client-side note)

  // paging
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // results
  const [rows, setRows] = useState<FilingRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // click-outside to close suggestions
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!sugRef.current) return;
      if (!sugRef.current.contains(e.target as Node)) setSugOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // fetch suggestions (debounced)
  useEffect(() => {
    const q = query.trim();
    setSelected(null);
    if (!q) { setSugs([]); return; }
    const id = setTimeout(async () => {
      try {
        const url = apiUrl(`/api/suggest?q=${encodeURIComponent(q)}`);
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`Suggest failed (${r.status})`);
        const j = await r.json();
        setSugs(j?.data || []);
        setSugOpen(true);
      } catch {
        setSugs([]);
        setSugOpen(false);
      }
    }, 180);
    return () => clearTimeout(id);
  }, [query]);

  function toggleForm(f: string) {
    setForms(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  }

  async function getFilings(resetPage = true) {
    try {
      setErr(null);
      setLoading(true);
      if (resetPage) setPage(1);

      // we need a CIK: either from selection, or a direct numeric CIK in the box.
      let cik = selected?.cik || "";
      if (!cik && /^\d{1,10}$/.test(query.trim())) {
        cik = query.trim().padStart(10, "0");
      }
      if (!cik) {
        setErr("Ticker/Company not recognized. Pick from suggestions or enter a numeric CIK.");
        setRows([]);
        setMeta(null);
        return;
      }

      const qs = new URLSearchParams();
      // never include empty params:
      if (forms.length) qs.set("form", forms.join(","));
      const s = normDate(start);
      const e = normDate(end);
      if (s) qs.set("start", s);
      if (e) qs.set("end", e);
      if (ownerName.trim()) qs.set("owner", ownerName.trim());
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));

      const url = apiUrl(`/api/filings/${encodeURIComponent(cik)}?${qs.toString()}`);
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();

      if (!r.ok) throw new Error(j?.error || "Fetch failed");

      setRows(j.data || []);
      setMeta(j.meta || null);
    } catch (e: any) {
      setErr(e?.message || "Error");
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }

  // run when page/pageSize change after first search
  useEffect(() => {
    if (selected?.cik) getFilings(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const headerName = useMemo(() => selected?.title || (meta?.name ?? ""), [selected, meta]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">EDGAR Filings</h1>
      <p className="text-gray-600 text-sm mb-4">
        Type a ticker or company name. Pick forms, dates, and get working View/Download links.
      </p>

      {/* Search + suggestions */}
      <div className="relative" ref={sugRef}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setSugOpen(true)}
          placeholder="Try NVDA, AAPL, TESLA, or 'Berkshire Hathaway'"
          className="w-full rounded-md border px-3 py-2"
        />
        {sugOpen && sugs.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow">
            {sugs.slice(0, 12).map((sug) => (
              <button
                key={`${sug.cik}-${sug.ticker ?? sug.title}`}
                onClick={() => { setSelected(sug); setQuery(sug.ticker ? `${sug.ticker} — ${sug.title}` : sug.title); setSugOpen(false); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
              >
                <span className="truncate">{sug.title}</span>
                <span className="ml-3 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                  {sug.ticker ?? sug.cik}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border bg-white p-3">
          <div className="text-sm font-medium mb-2">Form types</div>
          <div className="flex flex-wrap gap-2">
            {FORM_OPTIONS.map((f) => {
              const on = forms.includes(f);
              return (
                <button
                  key={f}
                  onClick={() => toggleForm(f)}
                  className={`text-xs rounded-full px-3 py-1 border ${on ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"}`}
                >
                  {f}
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-xs text-gray-600">
            Tip: Ownership forms (3/4/5) are for insiders; 13D/13G are large holders.
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <div className="text-gray-700">Start (YYYY or YYYY-MM or YYYY-MM-DD)</div>
              <input value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" />
            </label>
            <label className="text-sm">
              <div className="text-gray-700">End (optional)</div>
              <input value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-sm">
              <div className="text-gray-700">Insider name (optional)</div>
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" />
            </label>
            <div className="text-sm">
              <div className="text-gray-700">Paging</div>
              <div className="mt-1 flex gap-2">
                <select value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value))} className="rounded-md border px-2 py-2">
                  {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} / page</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="rounded-md border px-3 py-2 disabled:opacity-50"
                    disabled={page <= 1}
                  >Prev</button>
                  <span className="text-sm">Page {page}</span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    className="rounded-md border px-3 py-2"
                  >Next</button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <button
              onClick={() => getFilings(true)}
              className="rounded-md bg-black text-white px-4 py-2"
              disabled={loading}
            >
              {loading ? "Loading…" : "Get filings"}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mt-6">
        {err && <div className="text-red-600 text-sm mb-3">Error: {err}</div>}
        {meta && (
          <div className="mb-2 text-sm text-gray-700">
            <strong>{headerName || meta.cik}</strong> — {meta.total.toLocaleString()} filings
          </div>
        )}
        <div className="overflow-x-auto rounded-2xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Form</th>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Report</th>
                <th className="px-3 py-2 text-left">Links</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.accessionNumber}-${i}`} className="border-t">
                  <td className="px-3 py-2">{r.filingDate}</td>
                  <td className="px-3 py-2">{r.form}</td>
                  <td className="px-3 py-2">{r.title ?? r.primaryDocument}</td>
                  <td className="px-3 py-2">{r.reportDate || "—"}</td>
                  <td className="px-3 py-2">
                    <a className="text-blue-600 hover:underline mr-3" href={r.links.view} target="_blank" rel="noreferrer">View</a>
                    <a className="text-blue-600 hover:underline" href={r.links.download} target="_blank" rel="noreferrer">Download</a>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td className="px-3 py-6 text-gray-500" colSpan={5}>No filings yet. Try adjusting date range or forms.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}