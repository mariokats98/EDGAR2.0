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

// Big list of common/important SEC forms.
// (EDGAR returns exact form strings; we compare uppercase exact matches.)
const FORM_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "Core Periodic Reports",
    items: [
      "10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A", "11-K", "11-K/A", "20-F", "20-F/A", "40-F", "40-F/A"
    ],
  },
  {
    label: "Registration / Prospectus",
    items: [
      "S-1","S-1/A","S-3","S-3/A","S-4","S-4/A","S-8","S-8/A",
      "F-1","F-1/A","F-3","F-3/A","F-4","F-4/A",
      "424B1","424B2","424B3","424B4","424B5","424B7","424B8","424B9"
    ],
  },
  {
    label: "Ownership / Insider (Section 16)",
    items: ["3", "3/A", "4", "4/A", "5", "5/A"]
  },
  {
    label: "Beneficial Ownership (Schedules 13D/13G)",
    items: [
      "SC 13D","SC 13D/A","SC 13G","SC 13G/A", // EDGAR commonly returns with "SC "
      "13D","13D/A","13G","13G/A"              // include bare variants just in case
    ],
  },
  {
    label: "International/Others",
    items: ["6-K","6-K/A","144","144/A","13F-HR","13F-HR/A","13F-NT","13F-NT/A"]
  },
];

function classNames(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(" ");
}

export default function EdgarPage() {
  // ---- Search/suggest state ----
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState<LookupRow[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [loadingSug, setLoadingSug] = useState(false);
  const [cik, setCik] = useState<string>("");

  // ---- Filters / paging ----
  const [selectedForms, setSelectedForms] = useState<string[]>([]);
  const [start, setStart] = useState<string>(""); // YYYY-MM-DD
  const [end, setEnd] = useState<string>("");
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(10);

  // ---- Results state ----
  const [filings, setFilings] = useState<Filing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Suggest dropdown behavior ----
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  // Debounced lookup
  useEffect(() => {
    const term = q.trim();
    if (!term) { setSuggest([]); setShowSug(false); return; }
    const t = setTimeout(async () => {
      try {
        setLoadingSug(true);
        const r = await fetch(`/api/lookup/${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = await r.json();
        setSuggest(j.results || []);
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

  // Multi-select forms UI
  const [formOpen, setFormOpen] = useState(false);
  const formBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!formBtnRef.current) return;
      const dropdown = formBtnRef.current.parentElement;
      if (dropdown && !dropdown.contains(e.target as Node)) setFormOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function toggleForm(v: string) {
    setSelectedForms((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  }
  function clearForms() {
    setSelectedForms([]);
  }
  const formsSummary =
    selectedForms.length === 0
      ? "Any form"
      : selectedForms.length <= 3
      ? selectedForms.join(", ")
      : `${selectedForms.length} selected`;

  // Resolve user input → CIK (if needed), then fetch filings
  async function resolveAndFetch(pageIn?: number) {
    setError(null);
    let useCik = cik;
    const term = q.trim();

    // Resolve to CIK if user hasn't chosen a suggestion yet
    if (!useCik && term) {
      try {
        const r = await fetch(`/api/lookup/${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = await r.json();
        const rows: LookupRow[] = j.results || [];
        if (!rows.length) { setError("No matches. Try a different ticker/company."); return; }
        const chosen = rows[0];
        useCik = chosen.cik;
        setCik(useCik);
        setQ(`${chosen.ticker} — ${chosen.name}`);
        setSuggest([]); setShowSug(false);
      } catch (e: any) {
        setError(e?.message || "Lookup failed. Try again.");
        return;
      }
    }

    if (!useCik) { setError("Type a ticker/company, then pick a result."); return; }
    await fetchFilings(useCik, pageIn ?? page);
  }

  async function fetchFilings(cikIn: string, pageIn: number) {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    params.set("page", String(pageIn));
    params.set("per", String(per));
    if (selectedForms.length) params.set("forms", selectedForms.join(","));
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
      setFilings([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / per)), [total, per]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">EDGAR filings</h1>
      <p className="text-gray-600 text-sm mb-4">
        Type a ticker or company, pick a suggestion (or press Enter), then filter & paginate.
      </p>

      {/* Search with suggestions */}
      <div className="relative mb-3">
        <input
          ref={inputRef}
          value={q}
          onChange={(e)=>{ setQ(e.target.value); setShowSug(true); }}
          onKeyDown={(e)=>{ if (e.key === "Enter") { e.preventDefault(); resolveAndFetch(1); } if (e.key === "Escape") setShowSug(false); }}
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
                  setSuggest([]); setShowSug(false);
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

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {/* Multi-form dropdown */}
        <div className="relative">
          <button
            ref={formBtnRef}
            onClick={() => setFormOpen((v) => !v)}
            className="border rounded-md px-3 py-2 text-sm bg-white"
            title="Filter by SEC form(s)"
          >
            {formsSummary}
          </button>
          {formOpen && (
            <div className="absolute z-20 mt-1 w-80 max-h-96 overflow-auto bg-white border rounded-lg shadow p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Select form types</div>
                <button className="text-xs underline" onClick={clearForms}>Clear</button>
              </div>
              <div className="space-y-3">
                {FORM_GROUPS.map((grp) => (
                  <div key={grp.label}>
                    <div className="text-xs font-semibold text-gray-600 mb-1">{grp.label}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {grp.items.map((f) => {
                        const checked = selectedForms.includes(f.toUpperCase());
                        return (
                          <label key={f} className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleForm(f.toUpperCase())}
                            />
                            <span>{f}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Date range */}
        <label>
          <div className="text-xs text-gray-600">Start (YYYY-MM-DD)</div>
          <input value={start} onChange={(e)=>setStart(e.target.value)} className="border rounded-md px-2 py-2" placeholder="2019-01-01"/>
        </label>
        <label>
          <div className="text-xs text-gray-600">End (YYYY-MM-DD)</div>
          <input value={end} onChange={(e)=>setEnd(e.target.value)} className="border rounded-md px-2 py-2" placeholder="2025-12-31"/>
        </label>

        {/* Per-page */}
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

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-6 flex items-center gap-2">
          <button
            disabled={page<=1}
            onClick={()=>{ const p=Math.max(1,page-1); setPage(p); resolveAndFetch(p); }}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >Prev</button>
          <div className="text-sm">Page {page} / {totalPages}</div>
          <button
            disabled={page>=totalPages}
            onClick={()=>{ const p=Math.min(totalPages,page+1); setPage(p); resolveAndFetch(p); }}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >Next</button>
        </div>
      )}
    </div>
  );
}
