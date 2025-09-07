"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Filing = {
  cik: string;
  company: string;
  form: string;
  filed_at: string;
  title: string;
  source_url: string;
  primary_doc_url: string | null;
};

type LookupRow = { cik: string; ticker: string; name: string };

export default function EdgarPage() {
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState<LookupRow[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [loadingSug, setLoadingSug] = useState(false);

  const [cik, setCik] = useState<string>("");
  const [filings, setFilings] = useState<Filing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [formFilter, setFormFilter] = useState<string>("");
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(10);
  const [total, setTotal] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounced suggestions
  useEffect(() => {
    const term = q.trim();
    if (!term) { setSuggest([]); setShowSug(false); return; }

    const t = setTimeout(async () => {
      try {
        setLoadingSug(true);
        const r = await fetch(`/api/lookup/${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = await r.json();
        const rows: LookupRow[] = j.results || [];
        setSuggest(rows);
        setShowSug(true);
      } catch {
        setSuggest([]);
        setShowSug(false);
      } finally {
        setLoadingSug(false);
      }
    }, 200);

    return () => clearTimeout(t);
  }, [q]);

  // Resolve q → CIK (if user types ticker/company and presses Enter)
  async function resolveAndFetch(pageIn?: number) {
    setError(null);
    const term = q.trim();
    if (!term && !cik) { setError("Type a ticker/company, then pick a result."); return; }

    let pickedCik = cik;

    // If no CIK locked yet, try to resolve the current input
    if (!pickedCik && term) {
      try {
        const r = await fetch(`/api/lookup/${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = await r.json();
        const rows: LookupRow[] = j.results || [];
        if (!rows.length) {
          setError("No matches. Try a different ticker/company.");
          return;
        }
        // If exactly one match, auto-pick it. If multiple, pick the first (closest)
        const chosen = rows[0];
        pickedCik = chosen.cik;
        setCik(pickedCik);
        // Freeze the input to the chosen row for clarity
        setQ(`${chosen.ticker} — ${chosen.name}`);
        setSuggest([]);
        setShowSug(false);
      } catch (e: any) {
        setError(e?.message || "Lookup failed. Try again.");
        return;
      }
    }

    if (!pickedCik) { setError("Pick a company first."); return; }
    await fetchFilings(pickedCik, pageIn ?? page);
  }

  async function fetchFilings(cikIn: string, pageIn: number) {
    setLoading(true); setError(null);

    const params = new URLSearchParams();
    params.set("page", String(pageIn));
    params.set("per", String(per));
    if (formFilter) params.set("forms", formFilter);
    if (start) params.set("start", start);
    if (end) params.set("end", end);

    try {
      const r = await fetch(`/api/filings/${cikIn}?` + params.toString(), { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "SEC fetch failed");
      setFilings(j.results || []);
      setTotal(j.total || 0);
      setPage(j.page || 1);
    } catch (e: any) {
      setError(e?.message || "SEC fetch failed");
      setFilings([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / per)), [total, per]);

  // Handle Enter key to resolve+fetch
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      resolveAndFetch(1);
    }
    if (e.key === "Escape") {
      setShowSug(false);
    }
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!inputRef.current) return;
      if (!inputRef.current.parentElement?.contains(e.target as Node)) {
        setShowSug(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">EDGAR filings</h1>
      <p className="text-gray-600 text-sm mb-4">Type a ticker or company, pick a suggestion (or press Enter), then filter & paginate.</p>

      {/* Search input + suggestions */}
      <div className="relative mb-3">
        <input
          ref={inputRef}
          value={q}
          onChange={(e)=>{ setQ(e.target.value); setShowSug(true); }}
          onKeyDown={onKeyDown}
          placeholder="e.g., TSLA or TESLA, BRK.B or BERKSHIRE HATHAWAY"
          className="border rounded-lg px-3 py-2 w-full"
        />
        {showSug && q && (
          <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto bg-white border rounded-lg shadow">
            {loadingSug && <div className="p-2 text-sm text-gray-500">Loading…</div>}
            {!loadingSug && suggest.length === 0 && (
              <div className="p-2 text-sm text-gray-500">No matches</div>
            )}
            {suggest.map((s) => (
              <button
                key={s.cik + s.ticker}
                onClick={() => {
                  setCik(s.cik);
                  setQ(`${s.ticker} — ${s.name}`);
                  setSuggest([]);
                  setShowSug(false);
                  resolveAndFetch(1);
                }}
                className="block w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
              >
                <div className="font-medium">{s.ticker} • {s.name}</div>
                <div className="text-xs text-gray-500">CIK {s.cik}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filters & actions */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label>
          <div className="text-xs text-gray-600">Form</div>
          <select value={formFilter} onChange={(e)=>setFormFilter(e.target.value)} className="border rounded-md px-2 py-2">
            <option value="">Any</option>
            <option value="8-K">8-K</option>
            <option value="10-Q">10-Q</option>
            <option value="10-K">10-K</option>
            <option value="S-1">S-1</option>
            <option value="424B3">424B3</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </label>
        <label>
          <div className="text-xs text-gray-600">Start (YYYY-MM-DD)</div>
          <input value={start} onChange={(e)=>setStart(e.target.value)} className="border rounded-md px-2 py-2" placeholder="2019-01-01"/>
        </label>
        <label>
          <div className="text-xs text-gray-600">End (YYYY-MM-DD)</div>
          <input value={end} onChange={(e)=>setEnd(e.target.value)} className="border rounded-md px-2 py-2" placeholder="2025-12-31"/>
        </label>
        <label>
          <div className="text-xs text-gray-600">Per page</div>
          <select value={per} onChange={(e)=>setPer(parseInt(e.target.value))} className="border rounded-md px-2 py-2">
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>
        <button
          onClick={() => resolveAndFetch(1)}
          className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Loading…" : "Get filings"}
        </button>
      </div>

      {error && <div className="text-red-600 text-sm mb-3">Error: {error}</div>}

      {/* Results */}
      <section className="grid md:grid-cols-2 gap-4">
        {filings.map((f, i) => (
          <article key={i} className="rounded-xl bg-white p-4 shadow-sm border">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{f.filed_at}</span>
              <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{f.form}</span>
            </div>
            <h3 className="mt-2 font-medium">{f.title}</h3>
            <div className="mt-2 flex gap-2 text-xs">
              <a className="underline" href={f.source_url} target="_blank">Index</a>
              {f.primary_doc_url && <a className="underline" href={f.primary_doc_url} target="_blank">Primary Doc</a>}
            </div>
          </article>
        ))}
      </section>

      {total > 0 && (
        <div className="mt-6 flex items-center gap-2">
          <button
            disabled={page<=1}
            onClick={()=>{ const p=Math.max(1,page-1); setPage(p); resolveAndFetch(p); }}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >Prev</button>
          <div className="text-sm">Page {page} / {Math.max(1, Math.ceil(total / per))}</div>
          <button
            disabled={page>=Math.max(1, Math.ceil(total / per))}
            onClick={()=>{ const p=Math.min(Math.max(1, Math.ceil(total / per)), page+1); setPage(p); resolveAndFetch(p); }}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >Next</button>
        </div>
      )}
    </div>
  );
}
