// app/components/InsiderTape.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Txn = {
  date?: string | null;
  insider?: string | null;
  ticker?: string | null;
  company?: string | null;
  action?: "A" | "D" | string | null; // A=Acquire/Buy, D=Dispose/Sell (common shorthand)
  shares?: number | null;
  price?: number | null;
  value?: number | null;
  link?: string | null;
  _raw?: any;
};

type ActionFilter = "ALL" | "A" | "D";

function iso(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
const DEFAULT_TO = iso();
const DEFAULT_FROM = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return iso(d);
})();

function cls(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

// ---------- normalization helpers ----------
function toNumber(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = +x;
  return Number.isFinite(n) ? n : null;
}
function normalizeTxn(r: Record<string, any>): Txn {
  const date =
    r.transactionDate ||
    r.filingDate ||
    r.disclosureDate ||
    r.date ||
    null;

  const insider =
    r.insiderName ||
    r.reporter ||
    r.owner ||
    r.name ||
    null;

  const ticker =
    r.symbol ||
    r.ticker ||
    null;

  const company =
    r.company ||
    r.companyName ||
    r.issuer ||
    r.securityName ||
    null;

  // Action often "A" or "D" in many feeds; sometimes "Buy"/"Sell" strings
  let action: Txn["action"] =
    r.transactionCode ||
    r.action ||
    r.transactionType ||
    r.type ||
    null;

  if (typeof action === "string") {
    const up = action.toUpperCase();
    if (up.startsWith("BUY")) action = "A";
    else if (up.startsWith("SELL")) action = "D";
    else if (up === "A" || up === "D") action = up as "A" | "D";
  }

  const shares =
    toNumber(r.shares) ??
    toNumber(r.sharesTransacted) ??
    toNumber(r.amount) ??
    null;

  const price =
    toNumber(r.price) ??
    toNumber(r.transactionPrice) ??
    null;

  const value =
    toNumber(r.value) ??
    (shares && price ? shares * price : null);

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

// ---------- component ----------
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

  // Build API url (keep it simple; we’ll still client-filter defensively)
  const url = useMemo(() => {
    const sp = new URLSearchParams();
    // Your server route supports these (adjust if your route differs)
    if (ticker.trim()) sp.set("symbol", ticker.trim().toUpperCase());
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    // We won’t pass insider/action to the API unless your server route supports them.
    // Client-side filtering covers it reliably across providers.
    sp.set("limit", "500");
    return `/api/insider/activity?${sp.toString()}`;
  }, [ticker, from, to]);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(url, { cache: "no-store" });
        const j = await res.json();
        if (!res.ok || j?.ok === false) throw new Error(j?.error || "Request failed");
        const list: any[] = Array.isArray(j.rows) ? j.rows : Array.isArray(j) ? j : [];
        setRows(list.map(normalizeTxn));
      } catch (e: any) {
        setErr(e?.message || "Unexpected error");
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [url]);

  // client filters for insider/action/date (in case the API can’t filter)
  const filtered = useMemo(() => {
    const ins = insider.trim().toLowerCase();
    return rows.filter((r) => {
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
  }, [rows, insider, action, from, to]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-2xl border bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-gray-900">Insider Activity</div>
            <div className="text-sm text-gray-600">Recent Form 4-style insider trades</div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 grid gap-3 md:grid-cols-5">
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
            <div className="mb-1 text-xs text-gray-700">Insider</div>
            <input
              value={insider}
              onChange={(e) => setInsider(e.target.value)}
              placeholder="e.g., Cook"
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
                  <td className={cls(
                    "px-3 py-2",
                    r.action === "A" ? "text-emerald-700" : r.action === "D" ? "text-rose-700" : "text-gray-700"
                  )}>
                    {r.action || "—"}
                  </td>
                  <td className="px-3 py-2">{typeof r.shares === "number" ? r.shares.toLocaleString() : r.shares ?? "—"}</td>
                  <td className="px-3 py-2">{typeof r.price === "number" ? `$${r.price.toFixed(2)}` : "—"}</td>
                  <td className="px-3 py-2">{typeof r.value === "number" ? `$${r.value.toLocaleString()}` : "—"}</td>
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