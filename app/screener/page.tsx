// app/screener/page.tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

const TVChart = dynamic(() => import("../components/TVChart"), { ssr: false });

type Row = {
  symbol: string;
  name?: string;
  exchange?: string;
  sector?: string;
  price?: number;
  change?: number;
  changePct?: number;
  volume?: number;
  marketCap?: number;
  analystScore?: number | null;
  analystLabel?: string | null;
};

export default function ScreenerPage() {
  // Keep defaults *loose* so users see results immediately
  const [exchange, setExchange] = useState(""); // All
  const [sector, setSector] = useState("");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [mcapMin, setMcapMin] = useState<string>("");
  const [mcapMax, setMcapMax] = useState<string>("");
  const [volMin, setVolMin] = useState<string>(""); // was 1,000,000: remove by default
  const [changePctMin, setChangePctMin] = useState<string>("");
  const [analystMin, setAnalystMin] = useState<string>("");

  const [symbols, setSymbols] = useState(""); // explicit list optional
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(25);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [auto, setAuto] = useState(false);
  const timerRef = useRef<any>(null);

  const [selected, setSelected] = useState<Row | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / per)), [total, per]);

  async function load(p = 1) {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(p), per: String(per) });
      if (exchange) qs.set("exchange", exchange);
      if (sector) qs.set("sector", sector);
      if (priceMin) qs.set("priceMin", priceMin);
      if (priceMax) qs.set("priceMax", priceMax);
      if (mcapMin) qs.set("mcapMin", mcapMin);
      if (mcapMax) qs.set("mcapMax", mcapMax);
      if (volMin) qs.set("volMin", volMin);
      if (changePctMin) qs.set("changePctMin", changePctMin);
      if (analystMin) qs.set("analystMin", analystMin);
      if (symbols) qs.set("symbols", symbols);

      const r = await fetch(`/api/screener?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Screener failed");
      setRows(j.results || []);
      setTotal(j.total || 0);
      setPage(j.page || 1);
      // auto-select first row for chart if none selected
      if ((!selected || !j.results?.some((x: Row) => x.symbol === selected.symbol)) && j.results?.length) {
        setSelected(j.results[0]);
      }
    } catch (e) {
      console.error(e);
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); }, []); // initial

  // Auto-refresh quotes every 5s
  useEffect(() => {
    if (!auto) { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; return; }
    timerRef.current = setInterval(() => load(page), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [auto, page, per, exchange, sector, priceMin, priceMax, mcapMin, mcapMax, volMin, changePctMin, analystMin, symbols]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">Stock Screener</h1>
      <p className="text-gray-600 text-sm mb-4">
        Filter the market and click any row to view a live chart. Auto-refresh keeps quotes fresh.
      </p>

      {/* Controls */}
      <div className="rounded-2xl border bg-white p-4 mb-4 grid md:grid-cols-4 lg:grid-cols-6 gap-3">
        <label>
          <div className="text-xs text-gray-600">Exchange</div>
          <select value={exchange} onChange={e=>setExchange(e.target.value)} className="border rounded-md px-3 py-2 w-full">
            <option value="">All</option>
            <option value="NASDAQ">NASDAQ</option>
            <option value="NYSE">NYSE</option>
            <option value="AMEX">AMEX</option>
          </select>
        </label>
        <label>
          <div className="text-xs text-gray-600">Sector</div>
          <input value={sector} onChange={e=>setSector(e.target.value)} className="border rounded-md px-3 py-2 w-full" placeholder="Technology" />
        </label>
        <label>
          <div className="text-xs text-gray-600">Price Min</div>
          <input value={priceMin} onChange={e=>setPriceMin(e.target.value)} className="border rounded-md px-3 py-2 w-full" placeholder="10" />
        </label>
        <label>
          <div className="text-xs text-gray-600">Price Max</div>
          <input value={priceMax} onChange={e=>setPriceMax(e.target.value)} className="border rounded-md px-3 py-2 w-full" placeholder="200" />
        </label>
        <label>
          <div className="text-xs text-gray-600">Mkt Cap Min ($)</div>
          <input value={mcapMin} onChange={e=>setMcapMin(e.target.value)} className="border rounded-md px-3 py-2 w-full" placeholder="1000000000" />
        </label>
        <label>
          <div className="text-xs text-gray-600">Mkt Cap Max ($)</div>
          <input value={mcapMax} onChange={e=>setMcapMax(e.target.value)} className="border rounded-md px-3 py-2 w-full" placeholder="50000000000" />
        </label>
        <label>
          <div className="text-xs text-gray-600">Volume ≥</div>
          <input value={volMin} onChange={e=>setVolMin(e.target.value)} className="border rounded-md px-3 py-2 w-full" placeholder="(optional)" />
        </label>
        <label>
          <div className="text-xs text-gray-600">% Change ≥</div>
          <input value={changePctMin} onChange={e=>setChangePctMin(e.target.value)} className="border rounded-md px-3 py-2 w-full" placeholder="(optional)" />
        </label>
        <label>
          <div className="text-xs text-gray-600">Analyst ≥ (1–5)</div>
          <input value={analystMin} onChange={e=>setAnalystMin(e.target.value)} className="border rounded-md px-3 py-2 w-full" placeholder="3.5 (needs Finnhub key)" />
        </label>
        <label className="col-span-full">
          <div className="text-xs text-gray-600">Explicit symbols (comma-separated, optional)</div>
          <input value={symbols} onChange={e=>setSymbols(e.target.value)} className="border rounded-md px-3 py-2 w-full" placeholder="AAPL,MSFT,NVDA" />
        </label>
        <div className="flex items-center gap-3">
          <button onClick={()=>load(1)} className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60" disabled={loading}>
            {loading ? "Loading…" : "Run screen"}
          </button>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} />
            Auto-refresh
          </label>
        </div>
      </div>

      {/* Two-column: table + chart */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Table */}
        <div className="rounded-2xl border bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Symbol</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-right px-3 py-2">Price</th>
                <th className="text-right px-3 py-2">% Chg</th>
                <th className="text-right px-3 py-2">Volume</th>
                <th className="text-right px-3 py-2">Mkt Cap</th>
                <th className="text-right px-3 py-2">Analyst</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.symbol}
                  className={`border-t cursor-pointer hover:bg-gray-50 ${selected?.symbol === r.symbol ? "bg-gray-50" : ""}`}
                  onClick={() => setSelected(r)}
                >
                  <td className="px-3 py-2 font-medium">{r.symbol}</td>
                  <td className="px-3 py-2">{r.name || "—"}</td>
                  <td className="px-3 py-2 text-right">{r.price?.toLocaleString() ?? "—"}</td>
                  <td className={`px-3 py-2 text-right ${((r.changePct ?? 0) >= 0) ? "text-green-600" : "text-red-600"}`}>
                    {r.changePct != null ? `${Number(r.changePct).toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{r.volume?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.marketCap ? `$${r.marketCap.toLocaleString()}` : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {r.analystScore ? `${r.analystScore.toFixed(2)} (${r.analystLabel})` : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">No matches</td></tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {total > 0 && (
            <div className="p-3 flex items-center gap-2">
              <button disabled={page<=1} onClick={()=>{ const p = page-1; setPage(p); load(p); }} className="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
              <div className="text-sm">Page {page} / {totalPages}</div>
              <button disabled={page>=totalPages} onClick={()=>{ const p = page+1; setPage(p); load(p); }} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
              <div className="ml-auto text-xs text-gray-500">Showing {rows.length} of {total} matches</div>
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="rounded-2xl border bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              {selected ? (
                <>
                  <span className="font-semibold">{selected.symbol}</span>{" "}
                  <span className="text-gray-500">• {selected.name || "—"}</span>
                </>
              ) : "Select a symbol"}
            </div>
          </div>
          <div className="mt-3">
            {selected ? (
              <TVChart symbol={selected.symbol} exchange={selected.exchange} height={320} />
            ) : (
              <div className="text-sm text-gray-500">Click a row to view the chart.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
