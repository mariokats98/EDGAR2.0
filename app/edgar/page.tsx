"use client";
import { useState } from "react";

type Filing = {
  form: string;
  filed_at: string;
  title: string;
  index_url: string;
  primary_doc_url: string;
};

export default function EdgarPage() {
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState<{ name: string; ticker: string; cik: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function onType(v: string) {
    setQ(v);
    setErr(null);
    setFilings([]);
    if (v.trim().length < 1) return setSuggest([]);
    try {
      const r = await fetch(`/api/suggest?q=${encodeURIComponent(v)}&limit=8`, { cache: "no-store" });
      const j = await r.json();
      setSuggest(Array.isArray(j) ? j : []);
    } catch {
      setSuggest([]);
    }
  }

  async function loadByCIK(cik: string) {
    setLoading(true); setErr(null); setFilings([]);
    try {
      const r = await fetch(`/api/filings/${encodeURIComponent(cik)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to fetch filings");
      setFilings(j);
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit() {
    setErr(null); setFilings([]); setSuggest([]);
    try {
      const r = await fetch(`/api/lookup/${encodeURIComponent(q)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Not found");
      await loadByCIK(j.cik);
    } catch (e: any) {
      setErr(e?.message || "Lookup failed");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">EDGAR Filings</h1>
      <p className="text-sm text-gray-600 mb-4">Search by ticker (NVDA), company (NVIDIA), or CIK.</p>

      <div className="relative w-full max-w-xl">
        <input
          value={q}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
          placeholder="Try NVDA, BRK.B, NVIDIA, 0000320193…"
          className="w-full rounded-xl border px-3 py-2"
        />
        {!!suggest.length && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow">
            {suggest.map((s, i) => (
              <button
                key={i}
                className="w-full text-left px-3 py-2 hover:bg-gray-50"
                onClick={() => { setQ(`${s.ticker} — ${s.name}`); setSuggest([]); loadByCIK(s.cik); }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.ticker}</span>
                  <span className="text-xs text-gray-500">{s.cik}</span>
                </div>
                <div className="text-xs text-gray-600">{s.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3">
        <button
          onClick={onSubmit}
          className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Fetching…" : "Get filings"}
        </button>
      </div>

      {err && <div className="mt-3 text-sm text-red-600">Error: {err}</div>}

      <section className="mt-6 grid md:grid-cols-2 gap-4">
        {filings.map((f, i) => (
          <article key={i} className="rounded-2xl bg-white p-4 shadow-sm border">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{f.filed_at}</span>
              <span className="text-xs rounded-full bg-gray-100 px-2 py-1">{f.form}</span>
            </div>
            <h3 className="mt-2 font-medium">{f.title}</h3>
            <div className="mt-3 flex gap-2">
              <a className="text-sm text-blue-600 underline" href={f.index_url} target="_blank" rel="noreferrer">
                Filing Index
              </a>
              <a className="text-sm text-blue-600 underline" href={f.primary_doc_url} target="_blank" rel="noreferrer">
                Primary Doc
              </a>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
