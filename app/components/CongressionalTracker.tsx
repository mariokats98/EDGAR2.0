// app/components/CongressionalTracker.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Chamber = "senate" | "house";

type Row = {
  date: string;
  filed?: string;
  member: string;
  ticker: string;
  company?: string;
  action: string;
  shares?: number;
  price?: number;
  value?: number;
  amountText?: string;
  owner?: string;
  link?: string;
};

function fmtMoney(n?: number) {
  return typeof n === "number" && isFinite(n)
    ? n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : "—";
}
function fmtNum(n?: number) {
  return typeof n === "number" && isFinite(n) ? n.toLocaleString() : "—";
}

export default function CongressionalTracker() {
  const [chamber, setChamber] = useState<Chamber>("senate");

  const [member, setMember] = useState("");
  const [ticker, setTicker] = useState("");
  const [q, setQ] = useState("");

  // default: last 6 months
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("chamber", chamber);
      if (member.trim()) params.set("member", member.trim());
      if (ticker.trim()) params.set("ticker", ticker.trim().toUpperCase());
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await fetch(`/api/congress?${params.toString()}`, { cache: "no-store" });
      const js = await res.json();
      if (!res.ok || js?.ok === false) throw new Error(js?.error || "Fetch failed");
      setRows(Array.isArray(js.rows) ? js.rows : []);
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // Auto load on first mount & on chamber change
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamber]);

  function resetFilters() {
    setMember("");
    setTicker("");
    setQ("");
    const d1 = new Date();
    d1.setMonth(d1.getMonth() - 6);
    setFrom(d1.toISOString().slice(0, 10));
    setTo(new Date().toISOString().slice(0, 10));
  }

  const hasAmountText = useMemo(() => rows.some((r) => r.amountText), [rows]);

  return (
    <section className="rounded-2xl border bg-white p-4 md:p-5">
      <div className="mb-3">
        <div className="text-xl font-semibold text-gray-900">Congressional Tracker</div>
        <div className="text-sm text-gray-600">Stock trades by U.S. House & Senate members</div>
      </div>

      {/* chamber toggle */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(["senate", "house"] as Chamber[]).map((c) => (
          <button
            key={c}
            onClick={() => setChamber(c)}
            className={`rounded-lg px-3 py-2 text-sm font-medium border ${
              chamber === c ? "bg-black text-white border-black" : "bg-white text-gray-800"
            }`}
          >
            {c === "senate" ? "Senate" : "House"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="mb-1 text-xs text-gray-700">Member</div>
          <input
            value={member}
            onChange={(e) => setMember(e.target.value)}
            placeholder="e.g., Pelosi"
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-700">Ticker</div>
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g., AAPL"
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-700">Search</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="member, ticker, or company"
            className="w-full rounded-md border px-3 py-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
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
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={load}
          disabled={loading}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {loading ? "Loading…" : "Search"}
        </button>
        <button
          onClick={resetFilters}
          disabled={loading}
          className="rounded-md border px-4 py-2 text-sm text-gray-800"
        >
          Reset
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Member</th>
              <th className="px-3 py-2 text-left">Ticker</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-right">Shares</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Value</th>
              {hasAmountText && <th className="px-3 py-2 text-left">Amount (range)</th>}
              <th className="px-3 py-2 text-left">Link</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={hasAmountText ? 10 : 9}>
                  No trades match your filters
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.date}-${r.ticker}-${i}`} className={i % 2 ? "bg-white" : "bg-gray-50/40"}>
                  <td className="px-3 py-2 text-gray-700">{r.date || "—"}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{r.member || "—"}</td>
                  <td className="px-3 py-2">{r.ticker || "—"}</td>
                  <td className="px-3 py-2">{r.company || "—"}</td>
                  <td className="px-3 py-2">{r.action || "—"}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(r.shares)}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(r.price)}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(r.value)}</td>
                  {hasAmountText && <td className="px-3 py-2">{r.amountText || "—"}</td>}
                  <td className="px-3 py-2">
                    {r.link ? (
                      <a className="text-blue-600 hover:underline" href={r.link} target="_blank" rel="noreferrer">
                        source
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}