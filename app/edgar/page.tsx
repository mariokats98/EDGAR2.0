"use client";

import { useEffect, useMemo, useState } from "react";
import InsiderInput from "./InsiderInput";

type SuggestHit = { cik: string; name: string; ticker?: string };
type FilingRow = {
  form: string;
  filingDate: string;
  reportDate?: string;
  accessionNumber: string;
  primaryDocument: string;
  title?: string;
  links: { view: string; download: string };
};
type Meta = { cik: string; name: string; total: number; page: number; pageSize: number };

const FORM_OPTIONS = [
  "10-K","10-Q","8-K","S-1","S-3","S-4","13D","13G","6-K",
  "3","4","5","SC 13D","SC 13G","SD","11-K","20-F","40-F","424B5","424B3"
];

export default function EdgarPage() {
  // ---------- search state ----------
  const [companyQuery, setCompanyQuery] = useState("");
  const [picked, setPicked] = useState<SuggestHit | null>(null);

  const [forms, setForms] = useState<string[]>([]);
  const [start, setStart] = useState(""); // accepts YYYY / YYYY-MM / YYYY-MM-DD
  const [end, setEnd] = useState("");
  const [owner, setOwner] = useState(""); // insider name (optional)

  // ---------- results ----------
  const [rows, setRows] = useState<FilingRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset pagination on filter change
  useEffect(() => { setPage(1); }, [forms.join(","), start, end, owner, picked?.cik]);

  async function runSearch(p = 1) {
    if (!picked?.cik) {
      setErr("Please choose a company from the suggestions list.");
      return;
    }
    setLoading(true);
    setErr(null);

    try {
      const qs = new URLSearchParams({
        cik: picked.cik,
        page: String(p),
        pageSize: String(pageSize),
      });
      if (forms.length) qs.set("form", forms.join(","));
      if (start.trim()) qs.set("start", start.trim()); // YYYY / YYYY-MM / YYYY-MM-DD
      if (end.trim()) qs.set("end", end.trim());
      if (owner.trim()) qs.set("owner", owner.trim());

      const r = await fetch(`/api/filings?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.error || "Fetch failed");

      setRows(j.data || []);
      setMeta(j.meta || null);
      setPage(j.meta?.page || 1);
    } catch (e: any) {
      setErr(e?.message || "Error fetching filings");
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = useMemo(() => {
    if (!meta) return 1;
    return Math.max(1, Math.ceil((meta.total || 0) / pageSize));
  }, [meta, pageSize]);

  function toggleForm(f: string) {
    setForms(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">EDGAR Filings</h1>
      <p className="text-gray-600 text-sm mb-4">
        Search by company/ticker (pick from suggestions), filter by form, date range, or insider name. Links open the SEC index or the primary document.
      </p>

      {/* Search panel */}
      <section className="rounded-2xl border bg-white p-4 space-y-4">
        {/* Company / ticker with suggestions */}
        <div>
          <label className="block text-sm text-gray-700 mb-1">Company or Ticker</label>
          <InsiderInput
            value={companyQuery}
            onChange={(v) => {
              setCompanyQuery(v);
              setPicked(null); // force a re-pick to lock a valid CIK
            }}
            onPick={(hit) => {
              setCompanyQuery(hit.ticker ? `${hit.ticker} — ${hit.name}` : hit.name);
              setPicked(hit);
            }}
            placeholder="Type at least 1 letter, then pick…"
            api="/api/suggest"
          />
          {picked?.cik && (
            <div className="mt-1 text-xs text-gray-500">
              Selected: <strong>{picked.name}</strong> (CIK {picked.cik})
            </div>
          )}
        </div>

        {/* Forms pills */}
        <div>
          <div className="text-sm text-gray-700 mb-1">Form types</div>
          <div className="flex flex-wrap gap-2">
            {FORM_OPTIONS.map((f) => (
              <button
                key={f}
                onClick={() => toggleForm(f)}
                className={`text-xs rounded-full px-3 py-1 border ${
                  forms.includes(f) ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Dates + Insider */}
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block">
            <div className="text-sm text-gray-700">Start</div>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="YYYY or YYYY-MM or YYYY-MM-DD"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="block">
            <div className="text-sm text-gray-700">End</div>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="YYYY or YYYY-MM or YYYY-MM-DD"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label className="block sm:col-span-2">
            <div className="text-sm text-gray-700">Insider (optional)</div>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder='e.g., "Jensen Huang"'
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </label>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-700">
            Page size
            <select
              className="ml-2 rounded-md border px-2 py-1 text-sm"
              value={pageSize}
              onChange={(e) => setPageSize(parseInt(e.target.value))}
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button
            onClick={() => runSearch(1)}
            className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Searching…" : "Get filings"}
          </button>
          {err && <span className="text-sm text-red-600">Error: {err}</span>}
        </div>
      </section>

      {/* Results */}
      <section className="mt-6">
        {meta && (
          <div className="mb-2 text-sm text-gray-700">
            {meta.name} — {meta.total.toLocaleString()} results
          </div>
        )}

        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-2 text-left">Form</th>
                <th className="px-3 py-2 text-left">Filing date</th>
                <th className="px-3 py-2 text-left">Report date</th>
                <th className="px-3 py-2 text-left">Document</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.accessionNumber} className="border-t">
                  <td className="px-3 py-2">{r.form}</td>
                  <td className="px-3 py-2">{r.filingDate}</td>
                  <td className="px-3 py-2">{r.reportDate || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="max-w-[36ch] truncate" title={r.title || r.primaryDocument}>
                      {r.title || r.primaryDocument}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <a className="text-blue-600 hover:underline" href={r.links.view} target="_blank" rel="noreferrer">View</a>
                      <a className="text-blue-600 hover:underline" href={r.links.download} target="_blank" rel="noreferrer">Download</a>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                    {loading ? "Loading…" : "No results yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && totalPages > 1 && (
          <div className="mt-3 flex items-center gap-3">
            <button
              className="px-3 py-1 rounded border disabled:opacity-50"
              disabled={page <= 1 || loading}
              onClick={() => { const p = page - 1; setPage(p); runSearch(p); }}
            >
              Prev
            </button>
            <div className="text-sm text-gray-700">
              Page {page} of {totalPages}
            </div>
            <button
              className="px-3 py-1 rounded border disabled:opacity-50"
              disabled={page >= totalPages || loading}
              onClick={() => { const p = page + 1; setPage(p); runSearch(p); }}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </main>
  );
}