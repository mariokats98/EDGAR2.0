"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import tickerMap from "./data/tickerMap.json";

type Filing = {
  cik: string;
  company: string;
  form: string;
  filed_at: string;
  title: string;
  source_url: string;
  primary_doc_url?: string | null;
  items?: string[];
  badges?: string[];
  amount_usd?: number | null;
};
type Suggestion = { ticker: string; cik: string; name: string };

const SAMPLE = ["AAPL", "MSFT", "AMZN"];

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
  const [input, setInput] = useState("AAPL");
  const [resolvedCik, setResolvedCik] = useState<string>("0000320193");
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [show8K, setShow8K] = useState(true);
  const [show10Q, setShow10Q] = useState(true);
  const [show10K, setShow10K] = useState(true);
  const [showS1, setShowS1] = useState(true);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [openSuggest, setOpenSuggest] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      const r = await fetch(`/api/filings/${cik}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch filings");
      setFilings(j);
    } catch (e: any) {
      setError(e?.message || "Error fetching filings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFilingsFor("AAPL");
  }, []);

  const filtered = useMemo(() => {
    return filings.filter((f) => {
      const form = (f.form || "").toUpperCase();
      if (form.startsWith("8-K")) return show8K;
      if (form === "10-Q") return show10Q;
      if (form === "10-K") return show10K;
      if (form.startsWith("S-1") || form.startsWith("424B")) return showS1;
      return true;
    });
  }, [filings, show8K, show10Q, show10K, showS1]);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">EDGAR Filing Cards</h1>
          <p className="text-gray-600 text-sm mt-1">
            Enter a <strong>Ticker</strong> (AAPL/BRK.B), <strong>Company</strong> (TESLA), or <strong>CIK</strong> (10 digits).
          </p>
        </header>

        <div className="relative w-full max-w-md mb-3" ref={rootRef}>
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
              {loading ? "Fetching…" : "Fetch"}
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

        <div className="flex gap-2 mb-4">
          {SAMPLE.map((t) => (
            <button
              key={t}
              onClick={() => {
                setInput(t);
                fetchFilingsFor(t);
              }}
              className="text-xs rounded-full bg-gray-100 px-3 py-1"
              title={(tickerMap as Record<string, string>)[t] || ""}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
          <span className="text-gray-700 font-medium">Filter:</span>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={show8K} onChange={(e) => setShow8K(e.target.checked)} /> 8-K
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={show10Q} onChange={(e) => setShow10Q(e.target.checked)} /> 10-Q
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={show10K} onChange={(e) => setShow10K(e.target.checked)} /> 10-K
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showS1} onChange={(e) => setShowS1(e.target.checked)} /> S-1 / 424B
          </label>
          <span className="text-gray-500">
            Resolved CIK: <code>{resolvedCik}</code>
          </span>
        </div>

        {error && <div className="text-red-600 text-sm mb-4">Error: {error}</div>}

        <section className="grid md:grid-cols-2 gap-4">
          {filings.map((f, i) => (
            <article key={i} className="rounded-2xl bg-white p-4 shadow-sm border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{f.filed_at}</span>
                <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{f.form}</span>
              </div>
              <h3 className="mt-2 font-medium">{f.title}</h3>
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
