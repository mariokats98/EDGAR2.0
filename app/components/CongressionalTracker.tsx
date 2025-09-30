// app/components/CongressionalTracker.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Chamber = "senate" | "house";

type TradeRow = {
  date?: string | null;
  member?: string | null;
  ticker?: string | null;
  company?: string | null;
  action?: string | null;
  amount?: string | number | null;
  price?: number | null;
  link?: string | null;
  _raw?: any;
};

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function iso(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
const DEFAULT_TO = iso();
const DEFAULT_FROM = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return iso(d);
})();

export default function CongressionalTracker() {
  // equal-sized chamber buttons
  const [chamber, setChamber] = useState<Chamber>("senate");

  // filters
  const [member, setMember] = useState("");
  const [ticker, setTicker] = useState("");
  const [q, setQ] = useState(""); // generic search
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);

  // data
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const url = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("chamber", chamber);
    if (member.trim()) sp.set("member", member.trim());
    if (ticker.trim()) sp.set("ticker", ticker.trim().toUpperCase());
    if (q.trim()) sp.set("q", q.trim());
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    sp.set("limit", "500");
    return `/api/congress?${sp.toString()}`;
  }, [chamber, member, ticker, q, from, to]);

  // fetch (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(url, { cache: "no-store" });
        const j = await res.json();
        if (!res.ok || j?.ok === false) throw new Error(j?.error || "Request failed");
        setRows(Array.isArray(j.rows) ? j.rows : []);
      } catch (e: any) {
        setErr(e?.message || "Unexpected error");
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [url]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-gray-900">Congressional Tracker</div>
            <div className="text-sm text-gray-600">Stock trades by U.S. House & Senate members</div>
          </div>

          {/* Equal chamber buttons */}
          <div className="flex w-full gap-2 sm:w-auto sm:min-w-[260px]">
            {(["senate", "house"] as Chamber[]).map((c) => (
              <button
                key={c}
                onClick={() => setChamber(c)}
                className={cls(
                  "flex-1 rounded-md border px-4 py-2 text-sm font-medium",
                  chamber === c
                    ? "bg-black text-white border-black"
                    : "bg-white text-gray-800 hover:bg-gray-50"
                )}
                aria-pressed={chamber === c}
              >
                {c === "senate" ? "Senate" : "House"}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 grid gap-3 md:grid-cols-5">
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
          <div>
            <div className="mb-1 text-xs text-gray-700">From</div>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-700">To</div>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            />
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="overflow-x-auto rounded-2xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Ticker</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Link</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-600" colSpan={8}>
                  Loading…
                </td>
              </tr>
            ) : err ? (
              <tr>
                <td className="px-3 py-6 text-center text-rose-700" colSpan={8}>
                  {err}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-600" colSpan={8}>
                  No trades match your filters.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700">{r.date || "—"}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{r.member || "—"}</td>
                  <td className="px-3 py-2">{r.ticker || "—"}</td>
                  <td className="px-3 py-2">{r.company || "—"}</td>
                  <td className="px-3 py-2">{r.action || "—"}</td>
                  <td className="px-3 py-2">
                    {typeof r.amount === "number" ? r.amount.toLocaleString() : r.amount || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {typeof r.price === "number" ? `$${r.price.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.link ? (
                      <a className="text-blue-600 underline underline-offset-2" href={r.link} target="_blank" rel="noreferrer">
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
      </section>
    </div>
  );
}