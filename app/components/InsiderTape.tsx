// app/components/InsiderTape.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "./SectionHeader";

export type TxnFilter = "ALL" | "A" | "D";

type Row = {
  date?: string;
  symbol?: string;
  insiderName?: string;
  relationship?: string;
  type?: string; // "A" or "D"
  shares?: number;
  price?: number;
  value?: number;
};

export default function InsiderTape() {
  const [symbol, setSymbol] = useState("");
  const [type, setType] = useState<TxnFilter>("ALL");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => (type === "ALL" ? true : r.type === type));
  }, [rows, type]);

  async function load(sym: string) {
    const s = sym.trim();
    if (!s) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/insider/activity?symbol=${encodeURIComponent(s)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || "Failed");
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <SectionHeader title="Insider Activity" subtitle="Form 4 trading disclosures" icon={"🧑‍💼"} />
        <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_auto_auto]">
          <div>
            <div className="mb-1 text-xs text-gray-700">Ticker</div>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g., NVDA"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-700">Type</div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TxnFilter)}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="ALL">All</option>
              <option value="A">Acquisitions (A)</option>
              <option value="D">Disposals (D)</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => load(symbol)}
              disabled={!symbol.trim() || loading}
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Loading…" : "Load"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {err}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <SectionHeader title="Recent trades" icon={"📃"} />
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Insider</th>
                <th className="px-3 py-2 text-left">Relation</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-right">Shares</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">No data</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2">{r.date || "—"}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{r.insiderName || "—"}</td>
                  <td className="px-3 py-2">{r.relationship || "—"}</td>
                  <td className="px-3 py-2">{r.type || "—"}</td>
                  <td className="px-3 py-2">{r.symbol || "—"}</td>
                  <td className="px-3 py-2 text-right">{r.shares?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{typeof r.price === "number" ? r.price.toFixed(2) : "—"}</td>
                  <td className="px-3 py-2 text-right">{typeof r.value === "number" ? r.value.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}