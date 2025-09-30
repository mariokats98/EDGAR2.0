"use client";

import { useEffect, useMemo, useState } from "react";

type Chamber = "senate" | "house";
type TradeRow = {
  id?: string | number;
  filingDate?: string;
  transactionDate?: string;
  representative?: string; // House
  senator?: string;        // Senate
  party?: string;
  state?: string;
  ticker?: string;
  assetName?: string;
  type?: string;
  amount?: string;
  link?: string;
};

function fmtDate(d?: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(+dt)
    ? d
    : dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export default function CongressionalTracker() {
  const [chamber, setChamber] = useState<Chamber>("senate");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Reset list when chamber/search changes
  useEffect(() => {
    setRows([]);
    setPage(1);
    setHasMore(true);
  }, [chamber, query]);

  async function load() {
    if (loading || !hasMore) return;
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({
        chamber,
        q: query.trim(),
        page: String(page),
        limit: "25",
      });
      const r = await fetch(`/api/congress?${params.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.error || "Failed to load");

      const list: TradeRow[] = Array.isArray(j.rows) ? j.rows : [];
      setHasMore(list.length >= 25);
      setRows(prev => [...prev, ...list]);
      setPage(prev => prev + 1);
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  // Newest first
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ad = new Date(a.filingDate ?? a.transactionDate ?? 0).getTime();
      const bd = new Date(b.filingDate ?? b.transactionDate ?? 0).getTime();
      return bd - ad;
    });
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(240px,320px)_1fr_auto]">
          {/* Equal-width chamber buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setChamber("senate")}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                chamber === "senate" ? "bg-black text-white" : "bg-white"
              }`}
            >
              Senate
            </button>
            <button
              onClick={() => setChamber("house")}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                chamber === "house" ? "bg-black text-white" : "bg-white"
              }`}
            >
              House
            </button>
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search member or ticker (e.g., Pelosi or AAPL)"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />

          <div className="flex items-center justify-end">
            <button
              onClick={() => load()}
              disabled={loading || !hasMore}
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Loading…" : rows.length ? "Load more" : "Load trades"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {err}
          </div>
        )}
      </section>

      {/* List */}
      <section className="rounded-2xl border bg-white">
        {sorted.length === 0 && !loading ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No trades yet. Try “Load trades” or adjust your search.
          </div>
        ) : (
          <ul className="divide-y">
            {sorted.map((row, i) => {
              // Name: prefer house.senate fields but fall back if API varies
              const name =
                row.representative ||
                row.senator ||
                "—";

              const meta = [row.party, row.state].filter(Boolean).join(" • ");
              const ticker = (row.ticker || "—").toUpperCase();
              const asset = row.assetName || "—";
              const side = row.type || "—";
              const amount = row.amount || "—";
              const filed = fmtDate(row.filingDate);
              const traded = fmtDate(row.transactionDate);

              return (
                <li key={`${row.id ?? ""}-${i}`} className="p-4 md:p-5">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                    {/* Left: name */}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900">{name}</div>
                      <div className="text-xs text-gray-500">{meta || "\u2014"}</div>
                    </div>

                    {/* Middle: security & action */}
                    <div className="min-w-[240px]">
                      <div className="text-sm text-gray-900">
                        <span className="font-medium">{ticker}</span>{" "}
                        <span className="text-gray-500">• {asset}</span>
                      </div>
                      <div className="text-xs text-gray-500">Action: {side} • Amount: {amount}</div>
                    </div>

                    {/* Right: dates + source */}
                    <div className="text-right">
                      <div className="text-xs text-gray-900">Filed: {filed}</div>
                      <div className="text-xs text-gray-500">Traded: {traded}</div>
                      {row.link ? (
                        <a
                          href={row.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs text-blue-600 underline"
                        >
                          Filing
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer “Load more” */}
        {sorted.length > 0 && (
          <div className="border-t p-3 text-center">
            <button
              onClick={() => load()}
              disabled={loading || !hasMore}
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Loading…" : hasMore ? "Load more" : "No more"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}