// app/components/CongressionalTracker.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Chamber = "senate" | "house";
type SearchBy = "member" | "ticker";

// Raw (loosely typed to handle minor schema diffs from FMP)
type TradeRow = {
  date?: string;
  transactionDate?: string;
  disclosureDate?: string;
  reportedDate?: string;
  representative?: string;
  senator?: string;
  name?: string;
  owner?: string;
  type?: string;
  transaction?: string;
  assetDescription?: string;
  symbol?: string;
  ticker?: string;
  amount?: string;
  range?: string;
  comment?: string;
};

// Normalized for rendering
type NormalizedTrade = {
  date: string;
  member: string;
  ticker: string;
  company: string;
  action: string;
  amount: string;
};

function fmtDate(str?: string) {
  if (!str) return "—";
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? str : d.toISOString().slice(0, 10);
}

function normalizeRow(r: TradeRow): NormalizedTrade {
  const date =
    r.date ||
    r.transactionDate ||
    r.disclosureDate ||
    r.reportedDate ||
    "";

  const member = r.representative || r.senator || r.name || "";
  const ticker =
    (r.symbol && r.symbol !== "-" ? r.symbol : "") ||
    (r.ticker && r.ticker !== "-" ? r.ticker : "") ||
    "";
  const company = r.assetDescription || r.comment || "";
  const action = r.type || r.transaction || r.owner || "";
  const amount = r.amount || r.range || "";

  return {
    date: fmtDate(date),
    member,
    ticker,
    company,
    action,
    amount,
  };
}

export default function CongressionalTracker() {
  const [chamber, setChamber] = useState<Chamber>("senate");
  const [searchBy, setSearchBy] = useState<SearchBy>("member");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [rows, setRows] = useState<NormalizedTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("chamber", chamber);
      if (query.trim()) {
        params.set("by", searchBy);
        params.set("q", query.trim());
      }
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await fetch(`/api/congress?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "Failed to load trades");

      const list: TradeRow[] = Array.isArray(data?.rows) ? data.rows : [];
      setRows(list.map(normalizeRow));
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo(
    () => [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [rows]
  );

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        {/* Even toggle buttons */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setChamber("senate")}
            className={`rounded-md px-3 py-2 text-sm border ${
              chamber === "senate" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
            }`}
          >
            Senate
          </button>
          <button
            onClick={() => setChamber("house")}
            className={`rounded-md px-3 py-2 text-sm border ${
              chamber === "house" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
            }`}
          >
            House
          </button>
        </div>

        {/* Search row */}
        <div className="grid gap-3 md:grid-cols-[140px_minmax(160px,1fr)_auto]">
          <div>
            <div className="mb-1 text-xs text-gray-700">Search by</div>
            <select
              value={searchBy}
              onChange={(e) => setSearchBy(e.target.value as SearchBy)}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="member">Member</option>
              <option value="ticker">Ticker</option>
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-gray-700">
              {searchBy === "member" ? "Member name (e.g., Pelosi)" : "Ticker (e.g., NVDA)"}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchBy === "member" ? "Pelosi" : "NVDA"}
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={load}
              className="rounded-md bg-black px-4 py-2 text-sm text-white"
              disabled={loading}
            >
              {loading ? "Loading…" : "Search"}
            </button>
          </div>
        </div>

        {/* Date filters — always visible */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-[200px_200px]">
          <div>
            <div className="mb-1 text-xs text-gray-700">From</div>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-700">To</div>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            />
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {err}
          </div>
        )}
      </section>

      {/* Results */}
      <section className="rounded-2xl border bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
              <th className="w-[110px]">Date</th>
              <th className="min-w-[180px]">Member</th>
              <th className="w-[90px]">Ticker</th>
              <th className="min-w-[200px]">Company</th>
              <th className="w-[110px]">Action</th>
              <th className="w-[140px]">Amount / Range</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No trades found.
                </td>
              </tr>
            ) : (
              items.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700">{r.date || "—"}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{r.member || "—"}</td>
                  <td className="px-3 py-2">{r.ticker || "—"}</td>
                  <td className="px-3 py-2">{r.company || "—"}</td>
                  <td className="px-3 py-2">{r.action || "—"}</td>
                  <td className="px-3 py-2">{r.amount || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}