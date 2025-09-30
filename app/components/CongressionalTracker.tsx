// app/components/CongressionalTracker.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "./SectionHeader";

type Chamber = "senate" | "house";
type TradeRow = {
  date?: string;
  member?: string;
  ticker?: string;
  company?: string;
  action?: string; // Buy/Sell/...
  amount?: string | number;
  chamber?: string;
};

export default function CongressionalTracker() {
  const [chamber, setChamber] = useState<Chamber>("senate");
  const [member, setMember] = useState("");
  const [ticker, setTicker] = useState("");
  const [from, setFrom] = useState(""); // yyyy-mm-dd (optional)
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("chamber", chamber);
      if (member.trim()) params.set("member", member.trim());
      if (ticker.trim()) params.set("ticker", ticker.trim());
      if (from.trim()) params.set("from", from.trim());
      if (to.trim()) params.set("to", to.trim());

      const r = await fetch(`/api/congress?${params.toString()}`, { cache: "no-store" });
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

  useEffect(() => {
    // initial fetch
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamber]);

  const empty = rows.length === 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <SectionHeader
          title="Congressional Tracker"
          subtitle="Stock trades from House & Senate members"
          icon={"🏛️"}
        />

        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setChamber("senate")}
            className={`h-9 rounded-md px-3 text-sm font-medium ${
              chamber === "senate" ? "bg-black text-white" : "bg-gray-100 text-gray-800"
            }`}
          >
            Senate
          </button>
          <button
            onClick={() => setChamber("house")}
            className={`h-9 rounded-md px-3 text-sm font-medium ${
              chamber === "house" ? "bg-black text-white" : "bg-gray-100 text-gray-800"
            }`}
          >
            House
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="mb-1 text-xs text-gray-700">Member name</div>
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
              placeholder="e.g., NVDA"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
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

        <div className="mt-3">
          <button
            onClick={load}
            disabled={loading}
            className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {loading ? "Loading…" : "Search"}
          </button>
        </div>

        {err && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {err}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <SectionHeader title="Latest trades" icon={"🧾"} />
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Member</th>
                <th className="px-3 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Chamber</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {empty ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">No trades</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{r.date || "—"}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{r.member || "—"}</td>
                    <td className="px-3 py-2">{r.ticker || "—"}</td>
                    <td className="px-3 py-2">{r.company || "—"}</td>
                    <td className="px-3 py-2">{r.action || "—"}</td>
                    <td className="px-3 py-2">{(r.chamber || "").toString().toUpperCase()}</td>
                    <td className="px-3 py-2 text-right">
                      {typeof r.amount === "number" ? r.amount.toLocaleString() : (r.amount || "—")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}