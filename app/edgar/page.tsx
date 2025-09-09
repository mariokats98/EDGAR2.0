// app/edgar/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

/** ------------ Types ------------ */
type Row = {
  cik: string;
  company?: string;
  form: string;
  filed: string;
  accessionNumber: string;
  open: string; // fully-qualified link to primary doc or index
};

type ApiResult = {
  ok: boolean;
  total: number;
  count: number;
  data: Row[];
  query: {
    id: string;
    resolvedCIK: string | null;
    start: string;
    end: string;
    forms: string[];
    perPage: number;
    page: number;
    freeText: string | null;
  };
};

/** ------------ Helpers ------------ */
function normalizeCIKLike(input: string): string | null {
  if (!input) return null;
  let s = input.trim();
  if (/^CIK/i.test(s)) s = s.replace(/^CIK/i, "");
  s = s.replace(/\D/g, "");
  if (!s) return null;
  if (s.length > 10) s = s.slice(-10);
  return s.padStart(10, "0");
}

/** ------------ Constants ------------ */
const FORM_OPTIONS = [
  "10-K","10-Q","8-K","S-1","S-3","S-4","20-F","40-F","6-K","11-K",
  "13F-HR","SC 13D","SC 13D/A","SC 13G","SC 13G/A",
  "3","4","5","DEF 14A","DEFA14A","PX14A6G",
  "424B2","424B3","424B4","424B5","424B7","424B8",
];

/** ----------------------------------------------------------------------------
 * Page
 * ---------------------------------------------------------------------------*/
export default function EdgarPage() {
  // ----- search state -----
  const [identifier, setIdentifier] = useState<string>("");
  const [forms, setForms] = useState<string[]>(["10-K","10-Q","8-K"]);
  const [start, setStart] = useState<string>("2000-01-01");
  const [end, setEnd] = useState<string>(new Date().toISOString().slice(0, 10));
  const [perPage, setPerPage] = useState<number>(50);
  const [page, setPage] = useState<number>(1);
  const [q, setQ] = useState<string>("");

  // ----- results state -----
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number>(0);

  // ----- pagination input box state -----
  const [pageInput, setPageInput] = useState<string>("1");

  // Keep forms string stable
  const formsParam = useMemo(() => forms.join(","), [forms]);

  // Keep page box in sync when page changes
  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  // Reset to page 1 when filters change (but not when page changes)
  useEffect(() => {
    setPage(1);
  }, [identifier, formsParam, start, end, perPage, q]);

  /** Resolve to CIK */
  async function resolveToCIK(input: string): Promise<string> {
    const maybe = normalizeCIKLike(input);
    if (maybe) return maybe;

    const path = `/api/lookup/${encodeURIComponent(input.trim())}`;
    const r = await fetch(path, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const raw = j?.resolvedCIK || j?.cik || null;
      const norm = raw ? normalizeCIKLike(String(raw)) : null;
      if (norm) return norm;
    }
    throw new Error("Ticker/Company not recognized. Enter a numeric CIK or valid ticker.");
  }

  /** Core fetch that can override page */
  async function doFetch(pageOverride?: number) {
    const raw = identifier.trim();
    if (!raw) {
      setError("Enter a ticker, company name, or CIK.");
      return;
    }

    setLoading(true);
    setError(null);
    setRows([]);

    try {
      const cik10 = await resolveToCIK(raw);
      const currentPage = pageOverride ?? page;

      const params = new URLSearchParams({
        start,
        end,
        forms: formsParam,
        perPage: String(perPage),
        page: String(currentPage),
      });
      if (q.trim()) params.set("q", q.trim());

      const url = `/api/filings/${encodeURIComponent(cik10)}?${params.toString()}`;
      const r = await fetch(url, { cache: "no-store" });
      const j: ApiResult | { ok?: false; error?: string } = await r.json();

      if (!r.ok || !(j as ApiResult).ok) {
        throw new Error((j as any)?.error || `Failed to fetch filings (${r.status})`);
      }

      const ok = j as ApiResult;
      setRows(ok.data || []);
      setTotal(ok.total || 0);
      // ensure page state matches what we actually fetched
      setPage(currentPage);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil((total || 0) / (perPage || 1)));

  /** Handlers for pagination controls */
  function handleGo() {
    const n = parseInt(pageInput, 10);
    if (!Number.isFinite(n)) return;
    const target = Math.min(Math.max(1, n), totalPages);
    doFetch(target);
  }
  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGo();
    }
  }
  function prev() {
    if (page > 1) doFetch(page - 1);
  }
  function next() {
    if (page < totalPages) doFetch(page + 1);
  }

  /** ------------------------ Render ------------------------ */
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">EDGAR Filings</h1>
      <p className="text-gray-600 text-sm mb-4">
        Search by ticker, company name, or CIK. Click a result to open the SEC filing.
      </p>

      {/* Controls */}
      <section className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(260px,1.25fr)_1fr_1fr_1fr]">
          <div>
            <div className="text-sm text-gray-700 mb-1">Company / Ticker / CIK</div>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Enter ticker, company name, or CIK"
              className="w-full border rounded-md px-3 py-2"
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
              onClick={() => doFetch(1)}
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
          <div className="text-sm text-gray-600">
            {loading ? "Loading…" : `${total} matched${total !== 1 ? " filings" : " filing"}`}
          </div>

          {/* Pagination bar */}
          {total > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={prev}
                disabled={loading || page <= 1}
                className="px-2 py-1 rounded-md border bg-white disabled:opacity-50"
              >
                ← Prev
              </button>
              <span>Page</span>
              <input
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
                onKeyDown={handleKey}
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-14 border rounded-md px-2 py-1 text-center"
                aria-label="Page number"
              />
              <span>of {totalPages}</span>
              <button
                onClick={handleGo}
                disabled={loading || !pageInput}
                className="px-2 py-1 rounded-md border bg-white disabled:opacity-50"
              >
                Go
              </button>
              <button
                onClick={next}
                disabled={loading || page >= totalPages}
                className="px-2 py-1 rounded-md border bg-white disabled:opacity-50"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-3">
          {rows.map((r) => (
            <article key={r.accessionNumber} className="rounded-xl border bg-white p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <div className="text-sm text-gray-600">{r.company || r.cik}</div>
                  <div className="font-medium">
                    {r.form} • {r.filed}
                  </div>
                  <div className="text-xs text-gray-500">Accession: {r.accessionNumber}</div>
                </div>
                <div>
                  <a
                    href={r.open}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full bg-black text-white px-3 py-1.5 text-sm hover:opacity-90"
                  >
                    Open / Download
                  </a>
                </div>
              </div>
            </article>
          ))}

          {!loading && rows.length === 0 && !error && (
            <div className="text-sm text-gray-600">
              No results yet. Try a ticker (e.g., NVDA) or company name.
            </div>
          )}
        </div>
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