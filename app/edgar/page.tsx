// app/edgar/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SuggestItem = { cik: string; ticker: string; title: string };
type FilingRow = {
  form: string;
  filingDate: string;
  reportDate: string;
  accessionNumber: string;
  primaryDocument: string;
  title: string;
  links: { view: string; download: string };
};
type ApiResp = {
  meta: { cik: string; name: string; total: number; page: number; pageSize: number };
  data: FilingRow[];
};

const FORM_OPTIONS = [
  "10-K","10-Q","8-K","S-1","S-3","S-4","424B5","424B2","6-K","20-F",
  "13D","13G","13F-HR","SC 13D","SC 13G","SD","DFAN14A","DEFA14A",
  "3","4","5","11-K","10-K/A","10-Q/A","8-K/A","S-1/A","S-3/A","S-4/A",
];

function useDebounced<T>(val: T, ms = 250) {
  const [v, setV] = useState(val);
  useEffect(() => {
    const t = setTimeout(() => setV(val), ms);
    return () => clearTimeout(t);
  }, [val, ms]);
  return v;
}

export default function EdgarPage() {
  // search + suggestions
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 250);
  const [suggests, setSuggests] = useState<SuggestItem[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [picked, setPicked] = useState<SuggestItem | null>(null);

  // filters
  const [forms, setForms] = useState<string[]>([]);
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [owner, setOwner] = useState<string>(""); // optional insider name

  // results + paging
  const [rows, setRows] = useState<FilingRow[]>([]);
  const [meta, setMeta] = useState<ApiResp["meta"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // suggestions fetch
  useEffect(() => {
    let active = true;
    (async () => {
      const q = debounced.trim();
      if (!q) {
        setSuggests([]);
        return;
      }
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = await r.json();
        if (!active) return;
        setSuggests(j.data || []);
        setShowSug(true);
      } catch {
        if (!active) return;
        setSuggests([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [debounced]);

  const canSearch = !!picked?.cik;

  async function runSearch(p = 1) {
    if (!picked?.cik) {
      setErr("Please pick a company from suggestions.");
      return;
    }
    setLoading(true);
    setErr(null);
    setRows([]);
    try {
      const qs = new URLSearchParams({
        cik: picked.cik,
        page: String(p),
        pageSize: String(pageSize),
      });
      if (forms.length) qs.set("form", forms.join(","));
      if (start) qs.set("start", start);
      if (end) qs.set("end", end);
      if (owner.trim()) qs.set("owner", owner.trim());

      const r = await fetch(`/api/filings?${qs.toString()}`, { cache: "no-store" });
      const j = (await r.json()) as ApiResp | { error: string };
      if (!r.ok || (j as any).error) throw new Error((j as any).error || "Fetch failed");
      const data = j as ApiResp;
      setRows(data.data);
      setMeta(data.meta);
      setPage(data.meta.page);
    } catch (e: any) {
      setErr(e.message || "Error fetching filings");
    } finally {
      setLoading(false);
    }
  }

  // UI helpers
  function toggleForm(f: string) {
    setForms((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  const pageCount = useMemo(() => {
    if (!meta) return 0;
    return Math.max(1, Math.ceil(meta.total / meta.pageSize));
  }, [meta]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">EDGAR Filings</h1>
      <p className="text-gray-600 text-sm mb-4">
        Search company filings, filter by form type and date. Links open the SEC document and direct download.
      </p>

      {/* Search bar + suggestions */}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
          onFocus={() => suggests.length && setShowSug(true)}
          placeholder="Type a ticker or company (e.g., NVDA or NVIDIA)"
          className="w-full border rounded-md px-3 py-2"
        />
        {showSug && suggests.length > 0 && (
          <div
            className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow"
            onMouseDown={(e) => e.preventDefault()} // keep focus
          >
            {suggests.map((s) => (
              <button
                key={s.cik + s.ticker}
                className="flex w-full items-center justify-between px-3 py-2 hover:bg-gray-50 text-left"
                onClick={() => {
                  setPicked(s);
                  setQuery(`${s.ticker} — ${s.title}`);
                  setShowSug(false);
                }}
              >
                <span className="text-sm">{s.title}</span>
                <span className="text-xs text-gray-500">{s.ticker} · CIK {s.cik}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-3">
          <div className="text-sm font-medium">Form types</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {FORM_OPTIONS.map((f) => {
              const on = forms.includes(f);
              return (
                <button
                  key={f}
                  onClick={() => toggleForm(f)}
                  className={`text-xs rounded-full border px-3 py-1 ${on ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"}`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-3">
          <div className="text-sm font-medium">Date range & insider</div>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label>
              <div className="text-xs text-gray-700">Start (YYYY or YYYY-MM-DD)</div>
              <input value={start} onChange={(e) => setStart(e.target.value)} className="border rounded-md px-3 py-2 w-40" />
            </label>
            <label>
              <div className="text-xs text-gray-700">End (YYYY or YYYY-MM-DD)</div>
              <input value={end} onChange={(e) => setEnd(e.target.value)} className="border rounded-md px-3 py-2 w-40" />
            </label>
            <label className="flex-1">
              <div className="text-xs text-gray-700">Owner / insider name (optional)</div>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder='e.g., "Jensen Huang"'
                className="border rounded-md px-3 py-2 w-full"
              />
            </label>
            <label>
              <div className="text-xs text-gray-700">Per page</div>
              <select value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value))} className="border rounded-md px-3 py-2">
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <button
              onClick={() => runSearch(1)}
              disabled={!canSearch || loading}
              className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60"
            >
              {loading ? "Getting…" : "Get filings"}
            </button>
          </div>
          {picked && (
            <div className="mt-2 text-xs text-gray-600">
              <span className="font-medium">{picked.title}</span> (CIK {picked.cik}){forms.length ? ` — ${forms.join(", ")}` : ""}
            </div>
          )}
        </div>
      </div>

      {/* Errors */}
      {err && <div className="mt-3 text-sm text-red-600">Error: {err}</div>}

      {/* Results */}
      <div className="mt-4 rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-2 text-left">Form</th>
                <th className="px-3 py-2 text-left">Filing Date</th>
                <th className="px-3 py-2 text-left">Report Date</th>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Links</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.accessionNumber} className="border-t">
                  <td className="px-3 py-2">{r.form}</td>
                  <td className="px-3 py-2">{r.filingDate}</td>
                  <td className="px-3 py-2">{r.reportDate || "—"}</td>
                  <td className="px-3 py-2">{r.title || r.primaryDocument}</td>
                  <td className="px-3 py-2">
                    <a href={r.links.view} target="_blank" className="text-blue-600 hover:underline mr-3">
                      View
                    </a>
                    <a href={r.links.download} target="_blank" download className="text-blue-600 hover:underline">
                      Download
                    </a>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-gray-500" colSpan={5}>
                    No filings yet. Pick a company and click “Get filings”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pager */}
        {meta && meta.total > meta.pageSize && (
          <div className="flex items-center justify-between px-3 py-2 border-t text-sm">
            <div>
              {meta.total.toLocaleString()} results • page {meta.page} of {Math.ceil(meta.total / meta.pageSize)}
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded border disabled:opacity-50"
                disabled={page <= 1 || loading}
                onClick={() => runSearch(page - 1)}
              >
                Prev
              </button>
              <button
                className="px-3 py-1 rounded border disabled:opacity-50"
                disabled={page >= (meta ? Math.ceil(meta.total / meta.pageSize) : 1) || loading}
                onClick={() => runSearch(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footnote */}
      <div className="mt-6 text-center text-xs text-gray-500">
        This site republishes SEC EDGAR filings and BLS data.
      </div>
    </div>
  );
}