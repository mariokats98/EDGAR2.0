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
  open: string; // absolute URL to the filing (primary doc or index)
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

type SuggestItem = { label: string; value: string };

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
  // Search state
  const [identifier, setIdentifier] = useState<string>(""); // ticker / company / CIK
  const [forms, setForms] = useState<string[]>(["10-K","10-Q","8-K"]);
  const [start, setStart] = useState<string>("2000-01-01");
  const [end, setEnd] = useState<string>(new Date().toISOString().slice(0, 10));
  const [perPage, setPerPage] = useState<number>(50);
  const [page, setPage] = useState<number>(1);
  const [q, setQ] = useState<string>("");

  // Suggestions
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestItem[] | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);

  // Results
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number>(0);

  const formsParam = useMemo(() => forms.join(","), [forms]);

  /** Fetch suggestions (debounced) */
  useEffect(() => {
    const term = identifier.trim();
    if (!term) {
      setSuggestions(null);
      setShowSuggest(false);
      return;
    }
    setSuggesting(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        if (!r.ok) throw new Error();
        const j = (await r.json()) as { ok?: boolean; items?: SuggestItem[] };
        setSuggestions(j?.items && j.items.length ? j.items.slice(0, 8) : []);
        setShowSuggest(true);
      } catch {
        setSuggestions([]);
        setShowSuggest(true);
      } finally {
        setSuggesting(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [identifier]);

  /** Resolve whatever the user typed into a 10-digit CIK */
  async function resolveToCIK(input: string): Promise<string> {
    const maybe = normalizeCIKLike(input);
    if (maybe) return maybe;

    // Try lookup by symbol or company text
    const path = `/api/lookup/${encodeURIComponent(input.trim())}`;
    try {
      const r = await fetch(path, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        const raw = j?.resolvedCIK || j?.cik || (typeof j === "string" ? j : null);
        const norm = raw ? normalizeCIKLike(String(raw)) : null;
        if (norm) return norm;
      }
    } catch {
      // ignore; try fallback
    }

    // Fallback: try again with a query param (covers alt lookup handlers)
    try {
      const r = await fetch(`${path}?q=${encodeURIComponent(input.trim())}`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        const raw = j?.resolvedCIK || j?.cik || null;
        const norm = raw ? normalizeCIKLike(String(raw)) : null;
        if (norm) return norm;
      }
    } catch {
      // ignore
    }

    throw new Error("Ticker/Company not recognized. Pick from suggestions or enter a numeric CIK.");
  }

  /** Fetch filings */
  async function fetchFilings() {
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

      const params = new URLSearchParams({
        start,
        end,
        forms: formsParam,
        perPage: String(perPage),
        page: String(page),
      });
      if (q.trim()) params.set("q", q.trim());

      const url = `/api/filings/${encodeURIComponent(cik10)}?${params.toString()}`;
      const r = await fetch(url, { cache: "no-store" });

      let j: any = null;
      try {
        j = await r.json();
      } catch {
        throw new Error(`Failed to fetch filings (${r.status})`);
      }

      if (!r.ok || !j || j.ok === false) {
        throw new Error(j?.error || `Failed to fetch filings (${r.status})`);
      }

      const data: Row[] = Array.isArray(j.data) ? j.data : [];
      setRows(data);
      setTotal(j.total || data.length || 0);
    } catch (e: any) {
      setError(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  /** Reset to page 1 when inputs (other than page) change */
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifier, formsParam, start, end, perPage, q]);

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
          {/* Identifier + suggestions */}
          <div className="relative">
            <div className="text-sm text-gray-700 mb-1">Company / Ticker / CIK</div>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onFocus={() => identifier && setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              placeholder="e.g., NVDA, AAPL, JPMorgan, 0001045810"
              className="w-full border rounded-md px-3 py-2"
            />
            {showSuggest && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow">
                {suggesting && <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>}
                {!suggesting && suggestions && suggestions.length > 0 && (
                  <ul>
                    {suggestions.map((s) => (
                      <li key={`${s.value}-${s.label}`}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-gray-50"
                          onMouseDown={() => {
                            setIdentifier(s.value);
                            setShowSuggest(false);
                          }}
                        >
                          {s.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!suggesting && suggestions && suggestions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">No suggestions</div>
                )}
              </div>
            )}
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
                  <div className="text-sm text-gray-600">{r.company || r.cik}</div>
                  <div className="font-medium">
                    {r.form} • {r.filed}
                  </div>
                  <div className="text-xs text-gray-500">Accession: {r.accessionNumber}</div>
                </div>
                <div className="flex gap-2">
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

        {/* Pagination */}
        {total > rows.length && (
          <div className="mt-4 flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-md border bg-white text-sm disabled:opacity-50"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <div className="text-sm">Page {page}</div>
            <button
              className="px-3 py-1.5 rounded-md border bg-white text-sm disabled:opacity-50"
              disabled={loading || rows.length < perPage}
              onClick={() => setPage((p) => p + 1)}
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