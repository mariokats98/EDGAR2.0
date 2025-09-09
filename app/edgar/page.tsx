// app/edgar/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import InsiderInput from "./InsiderInput";

type Row = {
  cik: string;                    // 10-digit, zero-padded
  companyName?: string;           // from API, fallback to cik displayed
  form: string;
  filingDate: string;             // YYYY-MM-DD
  reportDate?: string;
  accessionNumber: string;        // 0000000000-YY-XXXXX
  primaryDocument: string;
  primaryDocDescription?: string;
  // Normalized working links coming from the API
  indexUrl: string;               // https://www.sec.gov/ixviewer/doc?action=…
  primaryUrl: string;             // https://www.sec.gov/Archives/edgar/data/…/…/primary.doc
  downloadUrl: string;            // zip or primary fallback
};

type ApiResult = {
  ok: boolean;
  total: number;
  count: number;
  data: Row[];
  query: {
    id: string;                   // whatever the user typed
    resolvedCIK: string | null;   // 10-digit CIK if resolved
    start: string;                // ISO date
    end: string;                  // ISO date
    forms: string[];              // list
    perPage: number;
    page: number;
    freeText: string | null;
  };
};

const FORM_OPTIONS = [
  "10-K","10-Q","8-K","S-1","S-3","S-4","20-F","40-F","6-K","11-K",
  "13F-HR","SC 13D","SC 13D/A","SC 13G","SC 13G/A",
  "3","4","5","DEF 14A","DEFA14A","PX14A6G","424B2","424B3","424B4","424B5","424B7","424B8",
];

export default function EdgarPage() {
  // ----- search state -----
  const [identifier, setIdentifier] = useState<string>(""); // ticker / company / CIK
  const [forms, setForms] = useState<string[]>(["10-K","10-Q","8-K"]);
  const [start, setStart] = useState<string>("2000-01-01");
  const [end, setEnd] = useState<string>(new Date().toISOString().slice(0,10));
  const [perPage, setPerPage] = useState<number>(50);
  const [page, setPage] = useState<number>(1);
  const [q, setQ] = useState<string>(""); // free-text (optional)

  // ----- results state -----
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number>(0);
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));

  // Keep forms string stable
  const formsParam = useMemo(() => forms.join(","), [forms]);

  async function fetchFilings() {
    const id = identifier.trim();
    if (!id) {
      setError("Enter a ticker, company name, or CIK.");
      return;
    }
    setLoading(true);
    setError(null);
    setRows([]);
    try {
      const params = new URLSearchParams({
        start,
        end,
        forms: formsParam,
        perPage: String(perPage),
        page: String(page),
      });
      if (q.trim()) params.set("q", q.trim());

      const url = `/api/filings/${encodeURIComponent(id)}?${params.toString()}`;
      const r = await fetch(url, { cache: "no-store" });
      const j = (await r.json()) as Partial<ApiResult> & { error?: string; details?: string };

      if (!r.ok || !j || j.ok === false) {
        // Show server message if present
        throw new Error(j?.error || j?.details || "Failed to fetch filings");
      }

      setRows((j.data as Row[]) || []);
      setTotal(j.total || 0);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  // reset page when inputs change (except page itself)
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifier, formsParam, start, end, perPage, q]);

  // auto re-fetch when page changes (but not on first mount with empty id)
  useEffect(() => {
    if (identifier.trim()) void fetchFilings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">EDGAR Filings</h1>
      <p className="text-gray-600 text-sm mb-4">Search by ticker, company name, or CIK. Click a result to open the SEC filing.</p>

      {/* Controls */}
      <section className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_1fr_1fr_1fr]">
          <div>
            <div className="text-sm text-gray-700 mb-1">Company / Ticker / CIK</div>
            <InsiderInput
              placeholder="e.g., NVDA, AAPL, JPMorgan, 0000320193"
              onPick={(val) => { setIdentifier(val); setPage(1); }}
              onType={(val) => setIdentifier(val)}
              value={identifier}
            />
          </div>

          <div>
            <div className="text-sm text-gray-700 mb-1">Start</div>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>

          <div>
            <div className="text-sm text-gray-700 mb-1">End</div>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>

          <div>
            <div className="text-sm text-gray-700 mb-1">Per Page</div>
            <select
              value={perPage}
              onChange={(e) => setPerPage(parseInt(e.target.value))}
              className="w-full border rounded-md px-3 py-2"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        {/* Forms & free text */}
        <div className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr_auto]">
          <div>
            <div className="text-sm text-gray-700 mb-1">Form Types</div>
            <FormPicker value={forms} onChange={setForms} />
          </div>

          <div>
            <div className="text-sm text-gray-700 mb-1">Free text (optional)</div>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g., merger, guidance, dividend"
              className="w-full border rounded-md px-3 py-2"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={fetchFilings}
              className="w-full md:w-auto px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Searching…" : "Get filings"}
            </button>
          </div>
        </div>
      </section>

      {/* Errors */}
      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      <section className="mt-4">
        <div className="text-sm text-gray-600 mb-2">
          {loading ? "Loading…" : `${total} matched${total !== 1 ? " filings" : " filing"}`}
        </div>

        <div className="grid gap-3">
          {rows.map((r) => (
            <article key={r.accessionNumber} className="rounded-xl border bg-white p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <div className="text-sm text-gray-600">{r.companyName || r.cik}</div>
                  <div className="font-medium">
                    {r.form} • {r.filingDate}
                    {r.reportDate ? <span className="text-gray-500 text-sm"> (report: {r.reportDate})</span> : null}
                  </div>
                  <div className="text-xs text-gray-500">Accession: {r.accessionNumber}</div>
                  {r.primaryDocDescription ? (
                    <div className="text-xs text-gray-600 mt-1">{r.primaryDocDescription}</div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={r.indexUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    View index
                  </a>
                  <a
                    href={r.primaryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    Open primary
                  </a>
                  <a
                    href={r.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full bg-black text-white px-3 py-1.5 text-sm hover:opacity-90"
                  >
                    Download
                  </a>
                </div>
              </div>
            </article>
          ))}

          {!loading && rows.length === 0 && !error && (
            <div className="text-sm text-gray-600">No results yet. Try a ticker (e.g., NVDA) or company name.</div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-md border bg-white text-sm disabled:opacity-50"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <div className="text-sm">Page {page} of {totalPages}</div>
            <button
              className="px-3 py-1.5 rounded-md border bg-white text-sm disabled:opacity-50"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next →
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

/** chips multi-select for forms */
function FormPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(f: string) {
    const has = value.includes(f);
    onChange(has ? value.filter((x) => x !== f) : [...value, f]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {FORM_OPTIONS.map((f) => {
        const active = value.includes(f);
        return (
          <button
            key={f}
            type="button"
            onClick={() => toggle(f)}
            className={`text-xs rounded-full px-3 py-1 border ${
              active ? "bg-black text-white border-black" : "bg-white hover:bg-gray-100"
            }`}
            title={f}
          >
            {f}
          </button>
        );
      })}
    </div>
  );
}