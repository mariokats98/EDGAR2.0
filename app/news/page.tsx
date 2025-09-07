"use client";
import { useEffect, useMemo, useState } from "react";

type NewsItem = {
  id: string;
  headline: string;
  summary?: string;
  url: string;
  image?: string | null;
  source?: string;
  tickers?: string[];
  published_at: string;
};

export default function NewsPage() {
  const [tickers, setTickers] = useState("");
  const [q, setQ] = useState("");
  const [per, setPer] = useState(10);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function load(p = 1) {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ page: String(p), per: String(per) });
      if (tickers) qs.set("tickers", tickers);
      if (q) qs.set("q", q);
      const r = await fetch(`/api/news?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "News fetch failed");
      setItems(j.results || []);
      setTotal(j.total || 0);
      setPage(j.page || 1);
    } catch (e: any) {
      setError(e?.message || "Error");
      setItems([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); }, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / per)), [total, per]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">Market News</h1>
      <p className="text-gray-600 text-sm mb-4">
        Filter by ticker or keyword. Powered by Alpha Vantage.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex-1 min-w-[220px]">
          <div className="text-xs text-gray-600">Ticker(s)</div>
          <input value={tickers} onChange={(e)=>setTickers(e.target.value)} className="border rounded-md px-3 py-2 w-full" placeholder="AAPL,MSFT,TSLA" />
        </label>
        <label className="flex-1 min-w-[220px]">
          <div className="text-xs text-gray-600">Keyword</div>
          <input value={q} onChange={(e)=>setQ(e.target.value)} className="border rounded-md px-3 py-2 w-full" placeholder="earnings, AI, guidance…" />
        </label>
        <label>
          <div className="text-xs text-gray-600">Per page</div>
          <select value={per} onChange={(e)=>setPer(parseInt(e.target.value))} className="border rounded-md px-3 py-2">
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>
        <button onClick={()=>load(1)} className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60" disabled={loading}>
          {loading ? "Loading…" : "Get news"}
        </button>
      </div>

      {error && <div className="text-red-600 text-sm mb-3">Error: {error}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        {items.map((n) => (
          <article key={n.id} className="rounded-xl bg-white p-4 shadow-sm border">
            <div className="text-xs text-gray-500 flex items-center justify-between">
              <span>{n.source || "Alpha Vantage"}</span>
              <span>{new Date(n.published_at).toLocaleString()}</span>
            </div>
            <h3 className="mt-2 font-medium">
              <a href={n.url} target="_blank" className="underline hover:no-underline">{n.headline}</a>
            </h3>
            {n.image && <img src={n.image} alt="" className="mt-2 rounded-md max-h-48 w-full object-cover" />}
            {n.summary && <p className="text-sm text-gray-700 mt-2 line-clamp-4">{n.summary}</p>}
            {n.tickers && n.tickers.length > 0 && (
              <div className="text-xs text-gray-600 mt-2 flex flex-wrap gap-2">
                {n.tickers.map((t) => <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5">{t}</span>)}
              </div>
            )}
          </article>
        ))}
      </div>

      {total > 0 && (
        <div className="mt-6 flex items-center gap-2">
          <button disabled={page<=1} onClick={()=>load(page-1)} className="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
          <div className="text-sm">Page {page} / {totalPages}</div>
          <button disabled={page>=totalPages} onClick={()=>load(page+1)} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
