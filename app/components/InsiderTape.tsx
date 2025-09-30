// app/components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

/** ---------- Types ---------- */
type Txn = {
  date?: string | null;
  insider?: string | null;
  ticker?: string | null;
  company?: string | null;
  action?: "A" | "D" | string | null; // A=Acquire (Buy), D=Dispose (Sell)
  shares?: number | null;
  price?: number | null;
  value?: number | null;
  link?: string | null;
  _raw?: any;
};

type ActionFilter = "ALL" | "A" | "D";

/** ---------- Utils ---------- */
const iso = (d = new Date()) => d.toISOString().slice(0, 10);
const DEFAULT_TO = iso();
const DEFAULT_FROM = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return iso(d);
})();

function n(v?: number | null, d = 2) {
  return typeof v === "number" && isFinite(v) ? v.toFixed(d) : "—";
}
function num(v?: number | null) {
  return typeof v === "number" && isFinite(v) ? v.toLocaleString() : "—";
}
function money(v?: number | null) {
  return typeof v === "number" && isFinite(v) ? `$${v.toLocaleString()}` : "—";
}
function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}
function toNumber(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = +x;
  return Number.isFinite(n) ? n : null;
}
function normalizeAction(x: any): "A" | "D" | string | null {
  if (!x && x !== 0) return null;
  if (typeof x === "string") {
    const s = x.trim().toUpperCase();
    if (s === "A" || s.startsWith("BUY") || s === "ACQUIRE" || s === "PURCHASE") return "A";
    if (s === "D" || s.startsWith("SELL") || s === "DISPOSE") return "D";
    return s; // unknown code
  }
  return null;
}

function normalizeTxn(r: Record<string, any>): Txn {
  // date
  const date =
    r.transactionDate ||
    r.tradeDate ||
    r.filingDate ||
    r.disclosureDate ||
    r.date ||
    null;

  // insider name
  const insider =
    r.insiderName ||
    r.reporter ||
    r.owner ||
    r.reportingOwner ||
    r.name ||
    r.person ||
    null;

  // ticker & company
  const ticker = (r.symbol || r.ticker || r.securityTicker || null) ?? null;
  const company =
    r.company ||
    r.companyName ||
    r.issuer ||
    r.issuerName ||
    r.securityName ||
    null;

  // action (buy/sell)
  let action = normalizeAction(
    r.transactionCode || r.action || r.transactionType || r.type || r.side
  );

  // shares, price, value
  const shares =
    toNumber(r.shares) ??
    toNumber(r.sharesTransacted) ??
    toNumber(r.amount) ??
    toNumber(r.quantity) ??
    null;

  const price =
    toNumber(r.price) ??
    toNumber(r.transactionPrice) ??
    toNumber(r.avgPrice) ??
    null;

  const value =
    toNumber(r.value) ??
    (shares && price ? shares * price : null);

  // link if available
  const link =
    r.link ||
    r.url ||
    r.form4Url ||
    r.source ||
    null;

  return { date, insider, ticker, company, action, shares, price, value, link, _raw: r };
}

function inRangeISO(isoDate?: string | null, from?: string, to?: string) {
  if (!isoDate) return false;
  const d = String(isoDate).slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/** ---------- Component ---------- */
export default function InsiderTape() {
  // filters
  const [ticker, setTicker] = useState("");
  const [insider, setInsider] = useState("");
  const [action, setAction] = useState<ActionFilter>("ALL");
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);

  // data
  const [rows, setRows] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Build the primary URL (your server route)
  const primaryUrl = useMemo(() => {
    const sp = new URLSearchParams();
    if (ticker.trim()) sp.set("symbol", ticker.trim().toUpperCase());
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    sp.set("limit", "500");
    return `/api/insider/activity?${sp.toString()}`;
  }, [ticker, from, to]);

  // Fallback URL (in case /api/insider/activity returns nothing)
  const fallbackUrl = useMemo(() => {
    const sp = new URLSearchParams();
    if (ticker.trim()) sp.set("symbol", ticker.trim().toUpperCase());
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    sp.set("limit", "500");
    return `/api/insider?${sp.toString()}`;
  }, [ticker, from, to]);

  // fetch with fallback
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        // 1) try /api/insider/activity
        const res1 = await fetch(primaryUrl, { cache: "no-store" });
        const j1 = await res1.json();
        const list1: any[] = Array.isArray(j1?.rows) ? j1.rows : Array.isArray(j1) ? j1 : [];
        if (!cancelled && list1.length > 0) {
          setRows(list1.map(normalizeTxn));
          return;
        }

        // 2) fallback to /api/insider
        const res2 = await fetch(fallbackUrl, { cache: "no-store" });
        const j2 = await res2.json();
        if (!res2.ok || j2?.ok === false) throw new Error(j2?.error || "Request failed");
        const list2: any[] = Array.isArray(j2?.rows) ? j2.rows : Array.isArray(j2) ? j2 : [];
        if (!cancelled) setRows(list2.map(normalizeTxn));
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || "Unexpected error");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [primaryUrl, fallbackUrl]);

  // client filtering (insider/action/date) and sorting
  const filtered = useMemo(() => {
    const ins = insider.trim().toLowerCase();
    const arr = rows.filter((r) => {
      if (from || to) {
        if (!inRangeISO(r.date || null, from || undefined, to || undefined)) return false;
      }
      if (ins && !(r.insider || "").toLowerCase().includes(ins)) return false;
      if (action !== "ALL") {
        const a = (r.action || "").toUpperCase();
        if (action === "A" && a !== "A") return false;
        if (action === "D" && a !== "D") return false;
      }
      return true;
    });

    // sort newest first by date
    return arr.sort((a, b) => {
      const da = (a.date || "").slice(0, 10);
      const db = (b.date || "").slice(0, 10);
      if (da < db) return 1;
      if (da > db) return -1;
      return 0;
    });
  }, [rows, insider, action, from, to]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-gray-900">Insider Activity</div>
            <div className="text-sm text-gray-600">Recent insider purchases and disposals</div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <div>
            <div className="mb-1 text-xs text-gray-700">Ticker</div>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g., AAPL"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div className="md:col-span-2">
            <div className="mb-1 text-xs text-gray-700">Insider Name</div>
            <input
              value={insider}
              onChange={(e) => setInsider(e.target.value)}
              placeholder="e.g., Cook, Musk, Pelosi"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <div className="mb-1 text-xs text-gray-700">Action</div>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as ActionFilter)}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="ALL">All</option>
              <option value="A">Buy (A)</option>
              <option value="D">Sell (D)</option>
            </select>
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
              <th className="px-3 py-2 font-medium">Insider</th>
              <th className="px-3 py-2 font-medium">Ticker</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Shares</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Link</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-600" colSpan={9}>
                  Loading…
                </td>
              </tr>
            ) : err ? (
              <tr>
                <td className="px-3 py-6 text-center text-rose-700" colSpan={9}>
                  {err}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-600" colSpan={9}>
                  No trades match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700">{r.date || "—"}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{r.insider || "—"}</td>
                  <td className="px-3 py-2">{r.ticker || "—"}</td>
                  <td className="px-3 py-2">{r.company || "—"}</td>
                  <td
                    className={cls(
                      "px-3 py-2",
                      r.action === "A"
                        ? "text-emerald-700"
                        : r.action === "D"
                        ? "text-rose-700"
                        : "text-gray-700"
                    )}
                  >
                    {r.action === "A" ? "Buy (A)" : r.action === "D" ? "Sell (D)" : r.action || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {typeof r.shares === "number" ? r.shares.toLocaleString() : r.shares ?? "—"}
                  </td>
                  <td className="px-3 py-2">{money(r.price)}</td>
                  <td className="px-3 py-2">{money(r.value)}</td>
                  <td className="px-3 py-2">
                    {r.link ? (
                      <a
                        className="text-blue-600 underline underline-offset-2"
                        href={r.link}
                        target="_blank"
                        rel="noreferrer"
                      >
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