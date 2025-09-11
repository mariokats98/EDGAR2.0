"use client";
import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  date: string;
  action: "BUY" | "SELL" | "OTHER";
  insider: string;
  title?: string;
  company: string;
  symbol: string;
  shares?: number;
  price?: number;
  valueUSD?: number;
  filingUrl?: string;
};

export default function InsiderTape({
  defaultSymbol = "",
  limit = 50,
}: {
  defaultSymbol?: string;
  limit?: number;
}) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (symbol.trim()) params.set("symbol", symbol.trim().toUpperCase());
    params.set("limit", String(limit));
    return `/api/insider/activity?${params.toString()}`;
  }, [symbol, limit]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(endpoint, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j?.error || "Fetch failed");
      setRows(j.data || []);
    } catch (e: any) {
      setErr(e?.message || "Error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  return (
    <section className="rounded-2xl border bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Insider Tape</h2>
          <p className="text-sm text-gray-600">
            Recent Form 4 transactions.{" "}
            <span className="hidden sm:inline">Green = buy, Red = sell.</span>
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="flex gap-2"
        >
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Filter by symbol (e.g., NVDA)"
            className="w-48 rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm text-white hover:opacity-90"
            disabled={loading}
          >
            {loading ? "Loading…" : "Apply"}
          </button>
        </form>
      </div>

      {err && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* List */}
      <div className="mt-4 divide-y">
        {rows.map((r) => (
          <article
            key={r.id}
            className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between"
          >
            {/* Left cluster */}
            <div className="flex items-center gap-3">
              <ActionBadge action={r.action} />
              <div>
                <div className="font-medium leading-tight">
                  {r.insider}{" "}
                  {r.title && (
                    <span className="text-gray-500 font-normal">• {r.title}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {r.company} ({r.symbol}) • {r.date}
                </div>
              </div>
            </div>

            {/* Right cluster */}
            <div className="flex items-center gap-3">
              <NumberPill label="Shares" value={fmtInt(r.shares)} />
              <NumberPill label="Price" value={fmtMoney(r.price)} />
              <NumberPill
                label="Value"
                value={r.valueUSD !== undefined ? fmtMoney(r.valueUSD) : "—"}
              />

              {r.filingUrl ? (
                <a
                  href={r.filingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-xs text-white shadow hover:opacity-95"
                >
                  Open Filing
                </a>
              ) : (
                <span className="text-xs text-gray-400">No link</span>
              )}
            </div>
          </article>
        ))}

        {!loading && !err && rows.length === 0 && (
          <div className="py-6 text-sm text-gray-600">No recent insider trades found.</div>
        )}
      </div>
    </section>
  );
}

function ActionBadge({ action }: { action: "BUY" | "SELL" | "OTHER" }) {
  const styles =
    action === "BUY"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : action === "SELL"
      ? "bg-red-100 text-red-700 border-red-200"
      : "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${styles}`}>
      {action}
    </span>
  );
}

function NumberPill({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-[96px] rounded-full border bg-white px-3 py-1.5 text-right">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-900">{value ?? "—"}</div>
    </div>
  );
}

function fmtInt(n?: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function fmtMoney(n?: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return undefined;
  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}