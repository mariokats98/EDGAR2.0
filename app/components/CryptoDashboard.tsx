// app/components/CryptoDashboard.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "./SectionHeader";

type Row = {
  symbol: string;    // e.g. BTCUSD
  price?: number;
  change24h?: number;
  volume24h?: number;
  marketCap?: number;
};

export default function CryptoDashboard() {
  const [list, setList] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch("/api/crypto/list", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || j?.ok === false) throw new Error(j?.error || "Failed");
        setList(Array.isArray(j.rows) ? j.rows : []);
      } catch (e: any) {
        setErr(e?.message || "Unexpected error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (!s) return list;
    return list.filter((r) => r.symbol?.toUpperCase().includes(s));
  }, [q, list]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <SectionHeader title="Crypto" subtitle="Market overview" icon={"🪙"} />
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto]">
          <div>
            <div className="mb-1 text-xs text-gray-700">Search (symbol)</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g., BTC"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>
          <div className="flex items-end text-sm text-gray-500">
            {loading ? "Loading…" : `${filtered.length} assets`}
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {err}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <SectionHeader title="Assets" icon={"📋"} />
        <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">24h Change</th>
                <th className="px-3 py-2 text-right">24h Volume</th>
                <th className="px-3 py-2 text-right">Market Cap</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">No results</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.symbol} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{r.symbol}</td>
                  <td className="px-3 py-2 text-right">{typeof r.price === "number" ? r.price.toLocaleString() : "—"}</td>
                  <td className={`px-3 py-2 text-right ${
                    typeof r.change24h === "number"
                      ? r.change24h > 0
                        ? "text-emerald-600"
                        : r.change24h < 0
                        ? "text-rose-600"
                        : "text-gray-700"
                      : "text-gray-700"
                  }`}>
                    {typeof r.change24h === "number" ? `${r.change24h.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{r.volume24h?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.marketCap?.toLocaleString() ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}