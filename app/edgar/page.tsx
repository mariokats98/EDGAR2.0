"use client";
import { useState } from "react";
import tickerMap from "../data/tickerMap.json";  


type Filing = {
  cik: string;
  company?: string;
  form: string;
  filed_at: string;
  title: string;
  source_url: string;
  primary_doc_url?: string | null;
  items?: string[];
  badges?: string[];
  amount_usd?: number | null;
  owner_roles?: string[];
  owner_names?: string[];
};
type Suggestion = { ticker: string; cik: string; name: string };
type FormFilter = "all" | "8-K" | "10-Q" | "10-K" | "S1" | "sec16";

const PAGE_SIZE_DEFAULT = 10;
const SAMPLE = ["AAPL", "MSFT", "AMZN"];

// ---- helpers ----
function resolveCIKLocalOrNumeric(value: string): string | null {
  const v = value.trim().toUpperCase();
  if (!v) return null;
  if (/^\d{10}$/.test(v)) return v;
  if (/^\d{1,9}$/.test(v)) return v.padStart(10, "0");
  const localMap = (tickerMap as Record<string, string>) || {};
  if (localMap[v]) return localMap[v];
  return null;
}
async function resolveCIK(value: string): Promise<string | null> {
  const local = resolveCIKLocalOrNumeric(value);
  if (local) return local;
  try {
    const r = await fetch(`/api/lookup/${encodeURIComponent(value)}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return j.cik || null;
  } catch {
    return null;
  }
}

export default function Home() {
  // search & results
  const [input, setInput] = useState("");
  const [resolvedCik, setResolvedCik] = useState<string>("");
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [formFilter, setFormFilter] = useState<FormFilter>("all");
  const [ownerQuery, setOwnerQuery] = useState("");
  const [relDirector, setRelDirector] = useState(false);
  const [relOfficer, setRelOfficer] = useState(false);
  const [relTenPct, setRelTenPct] = useState(false);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // pagination
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_DEFAULT);
  const [total, setTotal] = useState<number>(0);

  // suggestions
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [openSuggest, setOpenSuggest] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // refs
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // close suggest on outside click
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) {
        setOpenSuggest(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // fetch suggestions
  useEffect(() => {
    const q = input.trim();
    if (q.length < 1) {
      if (abortRef.current) abortRef.current.abort();
      setSuggestions([]);
      setSuggestLoading(false);
      setActiveIndex(-1);
      setOpenSuggest(false);
      return;
    }

    const id = setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        setSuggestLoading(true);
        setOpenSuggest(true);

        const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}&limit=200`, {
          cache: "no-store",
          signal: ac.signal,
        });
        const j = await r.json();
        const results: Suggestion[] = Array.isArray(j.results) ? j.results : [];
        setSuggestions(results);
        setActiveIndex(results.length ? 0 : -1);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setSuggestions([]);
          setActiveIndex(-1);
          setOpenSuggest(true);
        }
      } finally {
        setSuggestLoading(false);
      }
    }, 250);

    return () => clearTimeout(id);
  }, [input]);

  function onPickSuggestion(s: Suggestion) {
    setInput(s.ticker);
    setOpenSuggest(false);
    setActiveIndex(-1);
    setPage(1);
    fetchFilingsFor(s.ticker, 1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!openSuggest || (suggestions.length === 0 && !suggestLoading)) {
      if (e.key === "Enter") {
        setPage(1);
        fetchFilingsFor(input, 1);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => {
        const max = suggestions.length - 1;
        return prev < max ? prev + 1 : 0;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => {
        const max = suggestions.length - 1;
        return prev <= 0 ? max : prev - 1;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        onPickSuggestion(suggestions[activeIndex]);
      } else {
        setPage(1);
        fetchFilingsFor(input, 1);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpenSuggest(false);
      setActiveIndex(-1);
    }
  }

  // main fetch with pagination
  async function fetchFilingsFor(value: string, pageArg: number = page) {
    const cik = await resolveCIK(value);
    if (!cik) {
      setError("Ticker/CIK not recognized. Try any ticker (TSLA, V, BRK.B), a company name (TESLA), or a 10-digit CIK.");
      return;
    }
    setResolvedCik(cik);
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pageArg));
      params.set("max", String(pageSize));     // 10 per page
      params.set("fast", "1");                 // speed first
      const ISO = /^\d{4}-\d{2}-\d{2}$/;
      if (startDate && ISO.test(startDate)) params.set("from", startDate);
      if (endDate && ISO.test(endDate)) params.set("to", endDate);

      // server-side form filter to reduce payload
      const ff = formFilter.toUpperCase();
      if (ff !== "ALL") {
        params.set("form", ff === "SEC16" ? "SEC16" : ff); // "S1","SEC16","8-K","10-Q","10-K"
      }

      const cikSafe = (cik || "").replace(/\D/g, "").padStart(10, "0");
      const r = await fetch(`/api/filings/${cikSafe}?${params.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch filings");

      setFilings(Array.isArray(j.data) ? j.data : []);
      const meta = j.meta || {};
      setTotal(typeof meta.total === "number" ? meta.total : (Array.isArray(j.data) ? j.data.length : 0));
      setPage(meta.page || pageArg);
      setPageSize(meta.page_size || pageSize);
    } catch (e: any) {
      setError(e?.message || "Error fetching filings");
    } finally {
      setLoading(false);
    }
  }

  // client-side extras (owner name/roles only; server already filtered date/form)
  const filtered = useMemo(() => {
    const oq = ownerQuery.trim().toLowerCase();
    const wantsRel = relDirector || relOfficer || relTenPct;

    return filings.filter((f) => {
      const form = (f.form || "").toUpperCase();
      const is161 = form === "3" || form === "4" || form === "5";

      if (oq) {
        if (!is161) return false;
        const names = (f.owner_names || []).join(" ").toLowerCase();
        if (!names.includes(oq)) return false;
      }
      if (wantsRel) {
        if (!is161) return false;
        const roles = (f.owner_roles || []).map((x) => x.toLowerCase());
        if (relDirector && !roles.some((r) => r.startsWith("director"))) return false;
        if (relOfficer && !roles.some((r) => r.startsWith("officer"))) return false;
        if (relTenPct && !roles.some((r) => r.includes("10%"))) return false;
      }
      return true;
    });
  }, [filings, ownerQuery, relDirector, relOfficer, relTenPct]);

  // total pages
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // page buttons (1..N, cap showing 10 buttons with ellipses)
  function renderPagination() {
    if (totalPages <= 1) return null;

    const buttons: number[] = [];
    const maxButtons = 10;
    let start = Math.max(1, page - 4);
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1);

    for (let p = start; p <= end; p++) buttons.push(p);

    return (
      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          className="px-3 py-1 border rounded-md text-sm disabled:opacity-50"
          disabled={page === 1 || loading}
          onClick={() => { const np = page - 1; setPage(np); fetchFilingsFor(input || resolvedCik, np); }}
        >
          Prev
        </button>

        {start > 1 && (
          <>
            <button
              className="px-3 py-1 border rounded-md text-sm"
              onClick={() => { setPage(1); fetchFilingsFor(input || resolvedCik, 1); }}
            >
              1
            </button>
            {start > 2 && <span className="text-sm text-gray-500">…</span>}
          </>
        )}

        {buttons.map((p) => (
          <button
            key={p}
            className={`px-3 py-1 border rounded-md text-sm ${p === page ? "bg-black text-white border-black" : ""}`}
            disabled={loading}
            onClick={() => { setPage(p); fetchFilingsFor(input || resolvedCik, p); }}
          >
            {p}
          </button>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="text-sm text-gray-500">…</span>}
            <button
              className="px-3 py-1 border rounded-md text-sm"
              onClick={() => { setPage(totalPages); fetchFilingsFor(input || resolvedCik, totalPages); }}
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          className="px-3 py-1 border rounded-md text-sm disabled:opacity-50"
          disabled={page >= totalPages || loading}
          onClick={() => { const np = page + 1; setPage(np); fetchFilingsFor(input || resolvedCik, np); }}
        >
          Next
        </button>
      </div>
    );
  }

  // --- UI ---
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">EDGAR Filing Cards</h1>
          <p className="text-gray-600 text-sm mt-1">
            Search by <strong>Ticker</strong> (AAPL/BRK.B), <strong>Company</strong> (TESLA), or <strong>CIK</strong> (10 digits).
          </p>
        </header>

        {/* search */}
        <div className="relative w-full max-w-xl mb-3" ref={rootRef}>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); if (e.target.value.trim().length >= 1) setOpenSuggest(true); }}
              onFocus={() => { if (input.trim().length >= 1) setOpenSuggest(true); }}
              onKeyDown={onKeyDown}
              placeholder="Ticker (AAPL/BRK.B) • Company (TESLA) • CIK (0000320193)"
              className="border bg-white rounded-xl px-3 py-2 w-full"
            />
            <button
              onClick={() => { setPage(1); fetchFilingsFor(input, 1); }}
              className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Getting…" : "Get"}
            </button>
          </div>

          {openSuggest && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-md max-h-72 overflow-auto"
                 onMouseDown={(e) => e.preventDefault()}>
              {suggestLoading && <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>}
              {!suggestLoading && suggestions.map((s, i) => {
                const active = i === activeIndex;
                return (
                  <button
                    key={`${s.cik}-${i}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onPickSuggestion(s)}
                    className={`w-full text-left px-3 py-2 ${active ? "bg-gray-100" : "hover:bg-gray-50"}`}
                    title={s.name}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.ticker}</span>
                      <span className="text-xs text-gray-500">{s.cik}</span>
                    </div>
                    <div className="text-xs text-gray-600 truncate">{s.name}</div>
                  </button>
                );
              })}
              {!suggestLoading && suggestions.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
              )}
            </div>
          )}
        </div>

        {/* filters */}
        <div className="w-full max-w-3xl mb-5">
          <div className="rounded-xl border bg-white p-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-700 font-medium">Form Filter:</span>
              <select
                value={formFilter}
                onChange={(e) => { setFormFilter(e.target.value as FormFilter); setPage(1); if (input || resolvedCik) fetchFilingsFor(input || resolvedCik, 1); }}
                className="border rounded-md px-2 py-1 bg-white"
              >
                <option value="all">All forms</option>
                <option value="8-K">8-K</option>
                <option value="10-Q">10-Q</option>
                <option value="10-K">10-K</option>
                <option value="S1">S-1 / 424B</option>
                <option value="sec16">Only Forms 3/4/5</option>
              </select>
            </label>

            {formFilter === "sec16" && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-700">Reporting Person:</span>
                  <input
                    value={ownerQuery}
                    onChange={(e) => setOwnerQuery(e.target.value)}
                    placeholder="e.g., Elon Musk"
                    className="border rounded-md px-2 py-1"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={relDirector} onChange={(e) => setRelDirector(e.target.checked)} />
                  Director
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={relOfficer} onChange={(e) => setRelOfficer(e.target.checked)} />
                  Officer
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={relTenPct} onChange={(e) => setRelTenPct(e.target.checked)} />
                  10% Owner
                </label>
              </>
            )}

            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-700">From:</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded-md px-2 py-1" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-700">To:</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded-md px-2 py-1" />
            </label>

            <div className="flex-1" />
            <span className="text-xs text-gray-500">Showing {filings.length} of {total} results</span>
          </div>
        </div>

        {error && <div className="text-red-600 text-sm mb-4">Error: {error}</div>}

        {/* empty state */}
        {!loading && filings.length === 0 && !error && (
          <div className="text-sm text-gray-600 border rounded-xl bg-white p-6">
            <div className="font-medium mb-1">Start by searching a ticker/company/CIK.</div>
            <div>Use the page buttons below the results to navigate 10 filings at a time.</div>
          </div>
        )}

        {/* results */}
        <section className="grid md:grid-cols-2 gap-4 mt-4">
          {filtered.map((f, i) => (
            <article key={i} className="rounded-2xl bg-white p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{f.filed_at}</span>
                <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{f.form}</span>
              </div>
              <h3 className="mt-2 font-medium">{f.title}</h3>

              {f.owner_roles && f.owner_roles.length > 0 && (
                <div className="mt-2 text-xs">
                  <span className="font-semibold">Owner roles:</span> {f.owner_roles.join(", ")}
                </div>
              )}
              {f.badges && f.badges.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {f.badges.map((b, idx) => (
                    <span key={idx} className="text-[11px] rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5">
                      {b}
                    </span>
                  ))}
                </div>
              )}
              {typeof f.amount_usd === "number" && (
                <div className="mt-2 text-sm">
                  <span className="font-semibold">Largest amount: </span>
                  ${(f.amount_usd / 1_000_000).toFixed(1)}M
                </div>
              )}
              {f.items && f.items.length > 0 && (
                <div className="mt-3 text-xs text-gray-600">
                  <span className="font-semibold">Items:</span> {f.items.join(", ")}
                </div>
              )}
              <div className="mt-4 flex gap-3">
                <a className="text-sm underline" href={f.source_url} target="_blank">Filing index</a>
                {f.primary_doc_url && <a className="text-sm underline" href={f.primary_doc_url} target="_blank">Primary document</a>}
              </div>
            </article>
          ))}
        </section>

        {/* pagination */}
        {renderPagination()}

        {/* footer */}
        <footer className="mt-10 border-t pt-4 text-center text-xs text-gray-500">
  This site republishes SEC EDGAR filings and BLS data. <br />
  Powered by <a href="https://herevna.io" target="_blank" className="underline">Herevna.io</a>
</footer>
      </div>
    </main>
  );
}
