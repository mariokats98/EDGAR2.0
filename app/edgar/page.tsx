"use client";

import { useEffect, useMemo, useState } from "react";
import { InsiderInput } from "./InsiderInput";

/* ---------------- UI helpers ---------------- */

type Filing = {
  cik: string;
  company: string;
  form: string;
  filed_at: string; // YYYY-MM-DD
  title: string;
  source_url: string;        // directory on EDGAR
  primary_doc_url?: string;  // direct doc if available
  items?: string[];
  badges?: string[];
  amount_usd?: number | null;
};

const PAGE_SIZES = [10, 25, 50];

const FORM_OPTIONS = [
  // Core 10-K/Q/8-K & proxies
  "8-K", "10-Q", "10-K", "10-K/A", "10-Q/A",
  "DEF 14A", "DEFA14A", "DFAN14A", "PX14A6G", "PX14A6N",
  // Registration / prospectus
  "S-1", "S-1/A", "424B1", "424B2", "424B3", "424B4", "424B5", "424B7",
  // Ownership
  "3", "4", "5",
  // Large holders
  "13D", "13D/A", "SC 13D", "SC 13D/A",
  "13G", "13G/A", "SC 13G", "SC 13G/A",
  // Foreign issuers
  "6-K", "6-K/A", "20-F", "20-F/A", "40-F",
  // Others commonly used
  "11-K", "SD", "8-A12B", "8-A12G", "S-3", "S-8",
];

/* Small helpers */
function toCIK10(s: string) {
  const only = (s || "").replace(/\D/g, "");
  return only ? only.padStart(10, "0") : null;
}
function isCIKLike(s: string) {
  return /^\d{1,10}$/.test((s || "").trim());
}
function fmtUSD(n?: number | null) {
  if (n == null || !isFinite(n)) return "";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

/* ---------------- Page ---------------- */

export default function EdgarPage() {
  // Search input
  const [query, setQuery] = useState("");
  // Resolved CIK for this search
  const [resolvedCik, setResolvedCik] = useState<string | null>(null);

  // Filters
  const [forms, setForms] = useState<string[]>([]);
  const [start, setStart] = useState(""); // YYYY-MM-DD or blank
  const [end, setEnd] = useState("");     // YYYY-MM-DD or blank
  const [insider, setInsider] = useState(""); // from InsiderInput

  // Paging
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);

  // Results
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  // Don’t fetch until user explicitly requests
  const hasResults = filings.length > 0;

  /* ------- Lookup helpers ------- */

  async function lookupCIK(anySymbolOrName: string): Promise<string> {
    // 1) If user already entered a CIK-like string, accept it
    if (isCIKLike(anySymbolOrName)) {
      const cik10 = toCIK10(anySymbolOrName)!;
      setResolvedCik(cik10);
      return cik10;
    }
    // 2) Otherwise hit your existing lookup API (it should accept tickers or names)
    const qs = new URLSearchParams({ symbol: anySymbolOrName.trim() });
    const r = await fetch(`/api/lookup/${encodeURIComponent(anySymbolOrName.trim())}?${qs.toString()}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || !j?.cik) {
      throw new Error(j?.error || "Ticker/Company not recognized");
    }
    const cik = String(j.cik).replace(/\D/g, "").padStart(10, "0");
    setResolvedCik(cik);
    return cik;
  }

  /* ------- Fetch filings ------- */

  async function getFilings(requestedPage?: number) {
    setError(null);
    setLoading(true);
    try {
      const cik = await lookupCIK(query);
      // build querystring for filings route
      const qs = new URLSearchParams();
      if (forms.length) qs.set("forms", forms.join(","));
      if (start) qs.set("start", start);
      if (end) qs.set("end", end);
      if (insider) qs.set("q", insider);
      qs.set("page", String(requestedPage ?? page));
      qs.set("size", String(size));

      const r = await fetch(`/api/filings/${cik}?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch filings");

      const data: Filing[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
      setFilings(data);

      // support optional total from API; otherwise infer “unknown total”
      if (typeof j?.total === "number") {
        setTotal(j.total);
      } else {
        // If API doesn’t return total, assume “more” when page full.
        setTotal(data.length < size ? (requestedPage ?? page) * size : null);
      }
    } catch (e: any) {
      setError(e?.message || "Error");
      setFilings([]);
      setTotal(null);
    } finally {
      setLoading(false);
    }
  }

  // Reset page when changing page size
  useEffect(() => {
    setPage(1);
  }, [size]);

  // Re-run when page changes (but only after first fetch)
  useEffect(() => {
    if (resolvedCik) void getFilings(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /* ------- UI computed ------- */

  const pageCount = useMemo(() => {
    if (!total || total <= 0) return null;
    return Math.max(1, Math.ceil(total / size));
  }, [total, size]);

  /* ------- Render ------- */

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">EDGAR Filing Search</h1>
          <p className="text-gray-600 text-sm mt-1">
            Enter a <strong>Ticker</strong> (NVDA, BRK.B), <strong>Company</strong> (APPLE), or a <strong>CIK</strong> (10 digits), then refine with form type, date range, or insider name (Forms 3/4/5).
          </p>
        </header>

        {/* Primary search row */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="grow">
            <div className="text-sm text-gray-700">Company / Ticker / CIK</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., NVDA or NVIDIA or 0000320193"
              className="w-full rounded-md border bg-white px-3 py-2"
            />
          </label>

          <label className="min-w-[160px]">
            <div className="text-sm text-gray-700">Form types</div>
            <select
              multiple
              value={forms}
              onChange={(e) => {
                const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                setForms(opts);
              }}
              className="w-full rounded-md border bg-white px-3 py-2 h-[112px]"
            >
              {FORM_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <div className="text-[11px] text-gray-500 mt-1">
              Hold Ctrl/Cmd to multi-select. Leave empty for all.
            </div>
          </label>

          <label>
            <div className="text-sm text-gray-700">Start date</div>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-md border bg-white px-3 py-2"
            />
          </label>

          <label>
            <div className="text-sm text-gray-700">End date</div>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-md border bg-white px-3 py-2"
            />
          </label>

          <label className="min-w-[160px]">
            <div className="text-sm text-gray-700">Results per page</div>
            <select
              value={size}
              onChange={(e) => setSize(parseInt(e.target.value))}
              className="w-full rounded-md border bg-white px-3 py-2"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={() => {
              setPage(1);
              void getFilings(1);
            }}
            className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-60"
            disabled={loading || !query.trim()}
            title={!query.trim() ? "Enter a ticker/company/CIK first" : "Fetch filings"}
          >
            {loading ? "Getting…" : "Get filings"}
          </button>
        </div>

        {/* Insider picker (needs resolvedCik; we still render it, but it only opens when CIK exists) */}
        <div className="mb-4">
          <div className="text-sm text-gray-700 mb-1">Insider (Forms 3/4/5)</div>
          <div className="max-w-xl">
            <InsiderInput
              cik={resolvedCik || undefined}
              value={insider}
              setValue={setInsider}
              placeholder="Start typing reporting person name (e.g., Musk, Elon R.)"
            />
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            Suggestions appear after you resolve a company and type at least 2 letters.
          </div>
          {resolvedCik && (
            <div className="text-[11px] text-gray-500 mt-1">
              Resolved CIK: <code>{resolvedCik}</code>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Error: {error}
          </div>
        )}

        {/* Results */}
        <section className="grid md:grid-cols-2 gap-4">
          {filings.map((f, i) => (
            <article key={`${f.cik}-${f.filed_at}-${f.form}-${i}`} className="rounded-2xl bg-white p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{f.filed_at}</span>
                <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{f.form}</span>
              </div>
              <h3 className="mt-2 font-medium">{f.title || `${f.company} • ${f.form}`}</h3>

              {/* Badges/items */}
              {(f.badges?.length || f.items?.length) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(f.badges || []).map((b, idx) => (
                    <span key={`b-${idx}`} className="text-[11px] rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">
                      {b}
                    </span>
                  ))}
                  {(f.items || []).map((it, idx) => (
                    <span key={`i-${idx}`} className="text-[11px] rounded-full bg-gray-100 text-gray-800 px-2 py-0.5">
                      {it}
                    </span>
                  ))}
                </div>
              )}

              {/* Amount extraction for S-1 / 424B */}
              {f.amount_usd != null && (
                <div className="mt-2 text-sm text-gray-700">
                  Size mentioned: <strong>{fmtUSD(f.amount_usd)}</strong>
                </div>
              )}

              {/* Links */}
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {f.primary_doc_url && (
                  <a
                    className="rounded-md border px-3 py-1 hover:bg-gray-50"
                    href={f.primary_doc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                  >
                    Download primary
                  </a>
                )}
                <a
                  className="rounded-md border px-3 py-1 hover:bg-gray-50"
                  href={f.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  EDGAR index
                </a>
              </div>
            </article>
          ))}
        </section>

        {/* Empty state */}
        {!loading && !hasResults && !error && (
          <div className="mt-6 text-sm text-gray-600">
            Enter a ticker/company/CIK, adjust filters if needed, then click <strong>Get filings</strong>.
          </div>
        )}

        {/* Pagination */}
        {hasResults && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {total ? `Page ${page} of ${pageCount}` : `Showing ${filings.length} results`}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <button
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
                disabled={!!pageCount && page >= (pageCount || 1) || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Footer note */}
        <footer className="mt-10 text-center text-xs text-gray-500">
          This site republishes SEC EDGAR filings. Links go to sec.gov. Use filters to refine; ownership (3/4/5) can be narrowed by insider name.
        </footer>
      </div>
    </main>
  );
}