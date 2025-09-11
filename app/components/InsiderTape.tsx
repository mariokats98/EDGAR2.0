// app/components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Row = {
  id: string;
  insider: string;
  issuer: string;
  symbol?: string;
  filedAt: string;
  type?: "A" | "D";
  beneficialShares?: number;
  price?: number;
  valueUSD?: number;
  amount?: number;
  docUrl?: string;
  title?: string;
  cik?: string;
  accessionNumber?: string;
  primaryDocument?: string;
};

type FetchState =
  | { loading: true; error?: string | null; data: Row[] }
  | { loading: false; error?: string | null; data: Row[] };

const formatInt = (n?: number) =>
  n == null ? "—" : Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

const formatMoney = (n?: number) =>
  n == null ? "—" : Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const asISO = (d: Date) => d.toISOString().slice(0, 10);

const today = new Date();
const defaultStart = asISO(new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())); // last ~30d
const defaultEnd = asISO(today);

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function InsiderTape() {
  // ------- controls -------
  const [symbol, setSymbol] = useState<string>("NVDA");
  const [start, setStart] = useState<string>(defaultStart);
  const [end, setEnd] = useState<string>(defaultEnd);
  const [type, setType] = useState<"ALL" | "A" | "D">("ALL");

  // you can keep a tiny history or a simple cached key
  const qKey = useMemo(() => JSON.stringify({ symbol, start, end, type }), [symbol, start, end, type]);

  // ------- fetch state -------
  const [state, setState] = useState<FetchState>({ loading: false, error: null, data: [] });
  const inFlight = useRef<AbortController | null>(null);

  async function runFetch() {
    if (!symbol.trim()) {
      setState({ loading: false, error: "Enter a ticker symbol.", data: [] });
      return;
    }
    inFlight.current?.abort();
    const ac = new AbortController();
    inFlight.current = ac;
    setState({ loading: true, error: null, data: [] });

    try {
      const usp = new URLSearchParams({ symbol: symbol.trim().toUpperCase(), start, end, type });
      const url = `/api/insider?${usp.toString()}`;
      const res = await fetch(url, { signal: ac.signal, cache: "no-store" });
      const j = await res.json();
      if (!res.ok || j?.ok === false) {
        throw new Error(j?.error || `Request failed (${res.status})`);
      }
      setState({ loading: false, error: null, data: (j?.data as Row[]) || [] });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setState({ loading: false, error: e?.message || "Fetch error", data: [] });
    } finally {
      inFlight.current = null;
    }
  }

  // fetch on mount and when key changes (small debounce)
  useEffect(() => {
    const t = setTimeout(runFetch, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qKey]);

  // ------- render -------
  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Insider Transactions</h1>
        <p className="text-gray-600 text-sm">Form 4 line items parsed from SEC XML.</p>
      </header>

      {/* Controls */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <div>
            <div className="text-sm text-gray-700 mb-1">Ticker</div>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g., NVDA"
              className="w-full border rounded-md px-3 py-2"
              spellCheck={false}
            />
          </div>

          <div>
            <div className="text-sm text-gray-700 mb-1">Start</div>
            <input
              type="date"
              value={start}
              max={end}
              onChange={(e) => setStart(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>

          <div>
            <div className="text-sm text-gray-700 mb-1">End</div>
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>

          <div>
            <div className="text-sm text-gray-700 mb-1">Type</div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full border rounded-md px-3 py-2"
              title="A = Acquired, D = Disposed, ALL = both"
            >
              <option value="ALL">All</option>
              <option value="A">Buy (A)</option>
              <option value="D">Sell (D)</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={runFetch}
            disabled={state.loading}
            className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60"
          >
            {state.loading ? "Loading…" : "Refresh"}
          </button>
          {state.error && <div className="text-sm text-red-600">{state.error}</div>}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 text-sm text-gray-600">
        {state.loading
          ? "Loading…"
          : `${state.data.length} transaction${state.data.length === 1 ? "" : "s"} found`}
      </div>

      {/* List */}
      <div className="mt-3 grid gap-3">
        {state.data.map((r) => {
          const isBuy = r.type === "A";
          const isSell = r.type === "D";
          return (
            <article
              key={r.id}
              className="rounded-xl border bg-white p-4 hover:shadow-sm transition"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                {/* Left */}
                <div className="min-w-0">
                  <div className="text-sm text-gray-600">
                    {r.insider || "—"} • {r.issuer || "—"} {r.symbol ? `(${r.symbol})` : ""}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                    <span
                      className={classNames(
                        "inline-flex items-center rounded-full px-2 py-0.5 border text-xs",
                        isBuy && "border-emerald-600 text-emerald-700 bg-emerald-50",
                        isSell && "border-rose-600 text-rose-700 bg-rose-50",
                        !isBuy && !isSell && "border-gray-300 text-gray-700 bg-gray-50"
                      )}
                      title="A = Acquired, D = Disposed"
                    >
                      {r.type ?? "—"}
                    </span>
                    <span className="text-gray-500">Filed</span>
                    <span className="font-medium">{r.filedAt || "—"}</span>
                    {r.title && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span className="text-gray-500">Security</span>
                        <span className="font-medium">{r.title}</span>
                      </>
                    )}
                  </div>

                  {/* Numbers row */}
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-gray-500">Amount (shares)</div>
                      <div className="font-medium">{formatInt(r.amount)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Price ($)</div>
                      <div className="font-medium">{r.price == null ? "—" : formatMoney(r.price)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Value ($)</div>
                      <div className="font-medium">{formatMoney(r.valueUSD)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Beneficially Owned</div>
                      <div className="font-medium">{formatInt(r.beneficialShares)}</div>
                    </div>
                  </div>
                </div>

                {/* Right */}
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={r.docUrl || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full bg-black text-white px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
                  >
                    Open SEC Doc
                  </a>
                </div>
              </div>
            </article>
          );
        })}

        {!state.loading && state.data.length === 0 && !state.error && (
          <div className="text-sm text-gray-600">
            No transactions found for this window. Try a different symbol or widen the dates.
          </div>
        )}
      </div>
    </section>
  );
}