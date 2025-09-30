// app/components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

/** ---------- types the table expects ---------- */
type Row = {
  date: string | null;
  insider: string | null;   // <-- render this
  ticker: string | null;
  company: string | null;
  action: "A" | "D" | string | null;
  shares: number | null;    // <-- render this
  price: number | null;     // <-- render this
  value: number | null;     // <-- render this (shares * price)
  link?: string | null;
};

type TxnFilter = "ALL" | "A" | "D";

function fmtNum(n?: number | null) {
  return typeof n === "number" && isFinite(n) ? n.toLocaleString() : "—";
}
function fmtMoney(n?: number | null) {
  return typeof n === "number" && isFinite(n)
    ? n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";
}
function badge(action?: Row["action"]) {
  const a = (action || "").toString().toUpperCase();
  if (a === "A") {
    return (
      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        Purchase
      </span>
    );
  }
  if (a === "D") {
    return (
      <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
        Sale
      </span>
    );
  }
  return (
    <span className="rounded bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
      {a || "—"}
    </span>
  );
}

/** ---------- component ---------- */
export default function InsiderTape() {
  // server query controls
  const [tickerQ, setTickerQ] = useState("");
  const [insiderQ, setInsiderQ] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = useState<TxnFilter>("ALL");

  // data
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (tickerQ.trim()) params.set("symbol", tickerQ.trim().toUpperCase());
      if (insiderQ.trim()) params.set("insider", insiderQ.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", "500");

      const res = await fetch(`/api/insider/activity?${params.toString()}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok || j?.ok === false) {
        throw new Error(j?.error || "Failed to load insider activity");
      }
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // initial load
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (filter !== "ALL") {
      out = out.filter((r) => (r.action || "").toString().toUpperCase() === filter);
    }
    return out;
  }, [rows, filter]);

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") load();
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(160px,1fr)_minmax(180px,1fr)_auto_auto_auto_auto]">
          <div>
            <div className="mb-1 text-xs text-gray-700">Ticker</div>
            <input
              value={tickerQ}
              onChange={(e) => setTickerQ(e.target.value.toUpperCase())}
              onKeyDown={onEnter}
              placeholder="e.g., NVDA"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-gray-700">Insider Name</div>
            <input
              value={insiderQ}
              onChange={(e) => setInsiderQ(e.target.value)}
              onKeyDown={onEnter}
              placeholder="e.g., Tim Cook"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

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

          <div>
            <div className="mb-1 text-xs text-gray-700">Type</div>
            <div className="flex gap-1">
              {(["ALL", "A", "D"] as TxnFilter[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={
                    "rounded-md border px-3 py-2 text-sm " +
                    (filter === t
                      ? "border-black bg-black text-white"
                      : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50")
                  }
                >
                  {t === "ALL" ? "All" : t === "A" ? "Purchases" : "Sales"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={load}
              disabled={loading}
              className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Loading…" : "Search"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {err}
          </div>
        )}
      </section>

      {/* Table */}
      <section className="rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Insider</th>
                <th className="px-3 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-right">Shares</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-left">Link</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-gray-500" colSpan={9}>
                    {loading
                      ? "Loading…"
                      : "No results. Try a different date range, ticker, or insider name."}
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{r.date || "—"}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {r.insider || "—"}
                    </td>
                    <td className="px-3 py-2">{r.ticker || "—"}</td>
                    <td className="px-3 py-2">{r.company || "—"}</td>
                    <td className="px-3 py-2">{badge(r.action)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(r.shares)}</td>
                    <td className="px-3 py-2 text-right">
                      {typeof r.price === "number" ? `$${r.price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtMoney(r.value)}</td>
                    <td className="px-3 py-2">
                      {r.link ? (
                        <a
                          href={r.link}
                          className="text-blue-600 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          filing
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
    </div>
  );
}