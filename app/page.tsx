"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import tickerMap from "./data/tickerMap.json";

type Filing = {
  cik: string;
  company?: string;
  form: string;
  filed_at: string; // "YYYY-MM-DD"
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

const SAMPLE = ["AAPL", "MSFT", "AMZN"];

// --- helpers ---
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

type FormFilter = "all" | "8-K" | "10-Q" | "10-K" | "S1" | "sec16";

export default function Home() {
  const [input, setInput] = useState("");
  const [resolvedCik, setResolvedCik] = useState<string>("");
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reporting person filters
  const [ownerQuery, setOwnerQuery] = useState("");
  const [relDirector, setRelDirector] = useState(false);
  const [relOfficer, setRelOfficer] = useState(false);
  const [relTenPct, setRelTenPct] = useState(false);

  // Form filter dropdown + max history
  const [formFilter, setFormFilter] = useState<FormFilter>("all");
  const [maxCount, setMaxCount] = useState<number>(300);

  // NEW: Date range
  const [startDate, setStartDate] = useState<string>(""); // "YYYY-MM-DD"
  const [endDate, setEndDate] = useState<string>("");

  // suggestions
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [openSuggest, setOpenSuggest] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Close suggestions when clicking outside
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
    fetchFilingsFor(s.ticker);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!openSuggest || (suggestions.length === 0 && !suggestLoading)) {
      if (e.key === "Enter") fetchFilingsFor(input);
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
        fetchFilingsFor(input);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpenSuggest(false);
      setActiveIndex(-1);
    }
  }

  async function fetchFilingsFor(value: string) {
    const cik = await resolveCIK(value);
    if (!cik) {
      setError("Ticker/CIK not recognized. Try any ticker (TSLA, V, BRK.B), a company name (TESLA), or a 10-digit CIK.");
      return;
    }
    setResolvedCik(cik);
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/filings/${cik}?max=${encodeURIComponent(String(maxCount))}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch filings");
      setFilings(j);
    } catch (e: any) {
      setError(e?.message || "Error fetching filings");
    } finally {
      setLoading(false);
    }
  }

  // apply filters (form filter + owner name/roles + date range)
  const filtered = useMemo(() => {
    const oq = ownerQuery.trim().toLowerCase();
    const wantsRel = relDirector || relOfficer || relTenPct;

    // normalize date strings ("YYYY-MM-DD"); SEC dates are already like this
    const start = startDate || "";
    const end = endDate || "";

    return filings.filter((f) => {
      const form = (f.form || "").toUpperCase();
      const isS1 = form.startsWith("S-1") || form.startsWith("424B");
      const is8K = form.startsWith("8-K");
      const is161 = form === "3" || form === "4" || form === "5";

      // Date range filter (string compare works for YYYY-MM-DD)
      if (start && f.filed_at < start) return false;
      if (end && f.filed_at > end) return false;

      // Form filter dropdown
      if (formFilter === "8-K" && !is8K) return false;
      if (formFilter === "10-Q" && form !== "10-Q") return false;
      if (formFilter === "10-K" && form !== "10-K") return false;
      if (formFilter === "S1" && !isS1) return false;
      if (formFilter === "sec16" && !is161) return false;

      // Reporting person name filter (applies to 3/4/5)
      if (oq) {
        if (!is161) return false;
        const names = (f.owner_names || []).join(" ").toLowerCase();
        if (!names.includes(oq)) return false;
      }

      // Relationship filters (only for 3/4/5)
      if (wantsRel) {
        if (!is161) return false;
        const roles = (f.owner_roles || []).map((x) => x.toLowerCase());
        if (relDirector && !roles.some((r) => r.startsWith("director"))) return false;
        if (relOfficer && !roles.some((r) => r.startsWith("officer"))) return false;
        if (relTenPct && !roles.some((r) => r.includes("10%"))) return false;
      }

      return true;
    });
  }, [filings, ownerQuery, relDirector, relOfficer, relTenPct, formFilter, startDate, endDate]);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">EDGAR Filing Cards</h1>
          <p className="text-gray-600 text-sm mt-1">
            Search by <strong>Ticker</strong> (AAPL/BRK.B), <strong>Company</strong> (TESLA), or <strong>CIK</strong> (10 digits). Add owner filters for Forms 3/4/5.
          </p>
        </header>

        {/* Primary search (ticker/company/CIK) */}
        <div className="relative w-full max-w-xl mb-3" ref={rootRef}>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (e.target.value.trim().length >= 1) setOpenSuggest(true);
              }}
              onFocus={() => {
                if (input.trim().length >= 1) setOpenSuggest(true);
              }}
              onKeyDown={onKeyDown}
              placeholder="Ticker (AAPL/BRK.B) • Company (TESLA) • CIK (0000320193)"
              className="border bg-white rounded-xl px-3 py-2 w-full"
            />
            <button
              onClick={() => fetchFilingsFor(input)}
              className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Getting…" : "Get"}
            </button>
          </div>

          {openSuggest && (
            <div
              className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-md max-h-72 overflow-auto"
              onMouseDown={(e) => e.preventDefault()}
            >
              {suggestLoading && (
                <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
              )}
              {!suggestLoading &&
                suggestions.map((s, i) => {
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

        {/* Controls: form filter, owner query/roles, date range, max results */}
        <div className="w-full max-w-3xl mb-5">
          <div className="rounded-xl border bg-white p-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-700 font-medium">Form Filter:</span>
              <select
                value={formFilter}
                onChange={(e) => setFormFilter(e.target.value as FormFilter)}
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

            {/* Date range */}
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-700">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border rounded-md px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-700">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border rounded-md px-2 py-1"
              />
            </label>

            <div className="flex-1" />
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-700">Max results:</span>
              <input
                type="number"
                min={50}
                max={2000}
                step={50}
                value={maxCount}
                onChange={(e) => setMaxCount(Math.max(50, Math.min(2000, Number(e.target.value) || 300)))}
                className="border rounded-md px-2 py-1 w-24"
              />
            </label>
          </div>
        </div>

        {/* Sample quick buttons (no auto fetch on load) */}
        <div className="flex gap-2 mb-6">
          {SAMPLE.map((t) => (
            <button
              key={t}
              onClick={() => {
                setInput(t);
                fetchFilingsFor(t);
              }}
              className="text-xs rounded-full bg-gray-100 px-3 py-1 disabled:opacity-60"
              disabled={loading && input === t}
              title={(tickerMap as Record<string, string>)[t] || ""}
            >
              {loading && input === t ? "Getting…" : t}
            </button>
          ))}
        </div>

        {error && <div className="text-red-600 text-sm mb-4">Error: {error}</div>}

        {/* Empty state if nothing searched yet */}
        {!loading && filings.length === 0 && !error && (
          <div className="text-sm text-gray-600 border rounded-xl bg-white p-6">
            <div className="font-medium mb-1">Start by searching a ticker/company/CIK.</div>
            <div>
              Tip: pick a <em>Form Filter</em>, set a <em>Date Range</em>, or switch to “Only Forms 3/4/5” to search by
              <em> Reporting Person</em>.
            </div>
          </div>
        )}

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
                    <span
                      key={idx}
                      className="text-[11px] rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5"
                    >
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
                {f.primary_doc_url && (
                  <a className="text-sm underline" href={f.primary_doc_url} target="_blank">Primary document</a>
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
