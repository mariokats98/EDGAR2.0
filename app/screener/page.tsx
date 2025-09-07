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
  changePct?: number;
  volume?: number;
  marketCap?: number;
  analystScore?: number | null;
  analystLabel?: string | null;
};

export default function ScreenerPage() {
  // Gentle defaults (so you see results immediately)
  const [exchange, setExchange] = useState(""); // all
  const [sector, setSector] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [mcapMin, setMcapMin] = useState("");
  const [mcapMax, setMcapMax] = useState("");
  const [volMin, setVolMin] = useState("");
  const [changePctMin, setChangePctMin] = useState("");
  const [analystMin, setAnalystMin] = useState("");

  const [symbols, setSymbols] = useState("");
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(25);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);

  const [auto, setAuto] = useState(false);
  const timerRef = useRef<any>(null);

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

  useEffect(() => { load(1); }, []);
  useEffect(() => {
    if (!auto) { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; return; }
    timerRef.current = setInterval(() => load(page), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [auto, page, per, exchange, sector, priceMin, priceMax, mcapMin, mcapMax, volMin, changePctMin, analystMin, symbols]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal hero like Apple: clean, airy */}
      <div className="bg-white border-b">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Stock Screener</h1>
          <p className="text-gray-600 mt-2">Filter the market. Click a row to view a live chart. Keep quotes fresh with auto-refresh.</p>

          {/* Controls */}
          <div className="mt-6 grid gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Select label="Exchange" value={exchange} onChange={setExchange} options={["", "NASDAQ", "NYSE", "AMEX"]} />
            <Input label="Sector" value={sector} onChange={setSector} placeholder="Technology" />
            <Input label="Price Min" value={priceMin} onChange={setPriceMin} placeholder="10" />
            <Input label="Price Max" value={priceMax} onChange={setPriceMax} placeholder="200" />
            <Input label="Mkt Cap Min ($)" value={mcapMin} onChange={setMcapMin} placeholder="1000000000" />
            <Input label="Mkt Cap Max ($)" value={mcapMax} onChange={setMcapMax} placeholder="50000000000" />
            <Input label="Volume ≥" value={volMin} onChange={setVolMin} placeholder="(optional)" />
            <Input label="% Change ≥" value={changePctMin} onChange={setChangePctMin} placeholder="(optional)" />
            <Input label="Analyst ≥ (1–5)" value={analystMin} onChange={setAnalystMin} placeholder="3.5 (needs Finnhub)" />
            <div className="md:col-span-2">
              <Input label="Explicit symbols (optional)" value={symbols} onChange={setSymbols} placeholder="AAPL,MSFT,NVDA" />
            </div>
            <div className="flex items-end gap-3">
              <button
                onClick={() => load(1)}
                className="px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand-pink transition"
                disabled={loading}
              >
                {loading ? "Loading…" : "Run screen"}
              </button>
              <label className="text-sm text-gray-700 flex items-center gap-2">
                <input type="checkbox" checked={auto} onChange={(e)=>setAuto(e.target.checked)} />
                Auto-refresh
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Content: table + chart */}
      <div className="mx-auto max-w-6xl px-4 py-6 grid gap-6 lg:grid-cols-2">
        {/* Table card */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <Th>Symbol</Th>
                  <Th>Name</Th>
                  <Th right>Price</Th>
                  <Th right>% Chg</Th>
                  <Th right>Volume</Th>
                  <Th right>Mkt Cap</Th>
                  <Th right>Analyst</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.symbol}
                    className={`border-t hover:bg-gray-50 cursor-pointer ${selected?.symbol === r.symbol ? "bg-gray-50" : ""}`}
                    onClick={() => setSelected(r)}
                  >
                    <Td className="font-medium">{r.symbol}</Td>
                    <Td>{r.name || "—"}</Td>
                    <Td right>{r.price?.toLocaleString() ?? "—"}</Td>
                    <Td right className={(r.changePct ?? 0) >= 0 ? "text-green-600" : "text-red-600"}>
                      {r.changePct != null ? `${Number(r.changePct).toFixed(2)}%` : "—"}
                    </Td>
                    <Td right>{r.volume?.toLocaleString() ?? "—"}</Td>
                    <Td right>{r.marketCap ? `$${r.marketCap.toLocaleString()}` : "—"}</Td>
                    <Td right>{r.analystScore ? `${r.analystScore.toFixed(2)} (${r.analystLabel})` : "—"}</Td>
                  </tr>
                ))}
                {rows.length === 0 && !loading && (
                  <tr>
                    <Td colSpan={7} className="text-center text-gray-500 py-8">No matches</Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="p-3 flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => { const p = page - 1; setPage(p); load(p); }}
                className="px-3 py-1 border rounded-lg disabled:opacity-50"
              >Prev</button>
              <div className="text-sm">Page {page} / {totalPages}</div>
              <button
                disabled={page >= totalPages}
                onClick={() => { const p = page + 1; setPage(p); load(p); }}
                className="px-3 py-1 border rounded-lg disabled:opacity-50"
              >Next</button>
              <div className="ml-auto text-xs text-gray-500">Showing {rows.length} of {total}</div>
            </div>
          )}
        </div>

        {/* Chart card */}
        <div className="bg-white rounded-2xl border shadow-sm p-4">
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
              <TVChart symbol={selected.symbol} exchange={selected.exchange} height={360} />
            ) : (
              <div className="text-sm text-gray-500">Click a row to view the chart.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------- tiny UI atoms for a clean look --------- */
function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string)=>void; placeholder?: string; }) {
  return (
    <label>
      <div className="text-xs text-gray-600">{label}</div>
      <input
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 bg-white"
      />
    </label>
  );
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string)=>void; options: string[]; }) {
  return (
    <label>
      <div className="text-xs text-gray-600">{label}</div>
      <select value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-lg border px-3 py-2 bg-white">
        {options.map((o)=>(
          <option key={o} value={o}>{o || "All"}</option>
        ))}
      </select>
    </label>
  );
}
function Th({ children, right }: { children: any; right?: boolean }) {
  return <th className={`px-3 py-2 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, right, className = "", colSpan }: { children?: any; right?: boolean; className?: string; colSpan?: number; }) {
  return <td colSpan={colSpan} className={`px-3 py-2 ${right ? "text-right" : "text-left"} ${className}`}>{children}</td>;
}
