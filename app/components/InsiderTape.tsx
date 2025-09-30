// app/components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type TxnFilter = "ALL" | "P" | "S" | "A" | "D";

type Row = {
  date?: string;
  insider?: string;
  ticker?: string;
  company?: string;
  action?: string; // e.g. "P-PURCHASE", "S-SALE", "A-ACQUIRE", "D-DISPOSE"
  shares?: number;
  price?: number;
  value?: number;
  source?: string;
};

function fmtNum(n?: number, d = 0) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}
function fmtUsd(n?: number) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function clsx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export default function InsiderTape() {
  // filters
  const [symbol, setSymbol] = useState("");             // ticker filter (optional)
  const [from, setFrom] = useState(() => new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<TxnFilter>("ALL");

  // data
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runSearch() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (symbol.trim()) params.set("symbol", symbol.trim().toUpperCase());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      // pull a healthy page by default
      params.set("size", "200");

      const res = await fetch(`/api/insider/activity?${params.toString()}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || j?.ok === false) throw new Error(j?.error || "Failed to load data");

      const arr: Row[] = Array.isArray(j.rows) ? j.rows : [];
      setRows(arr);
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // initial load with today’s window (no symbol)
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (kind !== "ALL") {
      out = out.filter((r) => (r.action || "").startsWith(kind));
    }
    return out;
  }, [rows, kind]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(120px,1fr)_auto_auto_auto_auto]">
          <div>
            <div className="mb-1 text-xs text-gray-700">Ticker</div>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g., AAPL"
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

          <div className="flex items-end gap-2">
            <button
              onClick={runSearch}
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Loading…" : "Search"}
            </button>
            <button
              onClick={() => {
                setSymbol("");
                const d = new Date();
                const f = new Date();
                f.setMonth(f.getMonth() - 6);
                setFrom(f.toISOString().slice(0, 10));
                setTo(d.toISOString().slice(0, 10));
                setKind("ALL");
              }}
              className="rounded-md border px-4 py-2 text-sm"
              disabled={loading}
            >
              Reset
            </button>
          </div>

          <div className="flex items-end">
            <div className="inline-flex rounded-md border">
              {(["ALL", "P", "S", "A", "D"] as TxnFilter[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={clsx(
                    "px-3 py-2 text-xs",
                    kind === k ? "bg-gray-900 text-white" : "bg-white text-gray-700"
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
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
            <thead className="bg-gray-50 text-gray-600">
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
              {filtered.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={9}>
                    No trades in this range.
                  </td>
                </tr>
              )}
              {filtered.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700">{r.date || "—"}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{r.insider || "—"}</td>
                  <td className="px-3 py-2">{r.ticker || "—"}</td>
                  <td className="px-3 py-2">{r.company || "—"}</td>
                  <td className="px-3 py-2">{r.action || "—"}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(r.shares)}</td>
                  <td className="px-3 py-2 text-right">{fmtUsd(r.price)}</td>
                  <td className="px-3 py-2 text-right">{fmtUsd(r.value)}</td>
                  <td className="px-3 py-2">
                    {r.source ? (
                      <a className="text-blue-600 underline" href={r.source} target="_blank" rel="noreferrer">
                        source
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}