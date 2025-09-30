import { NextResponse } from "next/server";

/**
 * Robust normalizer for FMP congressional trading endpoints.
 * Handles multiple possible field names (they vary across accounts/endpoints).
 */

const FMP_KEY =
  process.env.FMP_API_KEY || process.env.NEXT_PUBLIC_FMP_KEY || "";

const BASE = "https://financialmodelingprep.com/api";
const SENATE_PATHS = [
  "/v4/senate-trading",
  "/v4/senate-trades",
  "/v4/ownership-senate-insider",
];
const HOUSE_PATHS = [
  "/v4/house-trading",
  "/v4/house-trades",
  "/v4/ownership-house-insider",
];

// ---------- helpers ----------
const first = (row: any, keys: string[]) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

const num = (v: any): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(String(v).replace(/,/g, "").replace(/\$/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

const cleanText = (s?: string) =>
  (s || "").replace(/\s+/g, " ").trim();

function toAction(v: any): string {
  const t = String(v || "").toUpperCase();
  if (!t) return "";
  if (t.startsWith("S")) return "S-SALE";
  if (t.startsWith("P") || t.includes("PUR")) return "P-PURCHASE";
  return t;
}

function normalizeRow(row: any, chamber: "senate" | "house") {
  // Member names show up under many labels
  const member =
    cleanText(
      first(row, [
        chamber === "senate" ? "senator" : "representative",
        "member",
        "politician",
        "congressPerson",
        "congressperson",
        "congress_person",
        "name",
        "trader",
        "reportingOwner", // occasionally used
      ])
    ) || "";

  const ticker = String(first(row, ["symbol", "ticker"]) || "").toUpperCase();

  const company =
    cleanText(
      first(row, [
        "assetDescription",
        "assetName",
        "securityName",
        "company",
        "security",
      ])
    ) || "";

  const action = toAction(first(row, ["transaction", "type", "action"]));

  // price / shares can be absent; try many spellings
  const price =
    num(first(row, ["price", "pricePerShare", "sharePrice", "priceShare", "transactionPrice", "unitPrice"])) ??
    undefined;

  const shares =
    num(first(row, ["shares", "share", "volume", "amountOfShares", "amount_shares", "qty", "quantity", "units"])) ??
    undefined;

  // amount range string (e.g., "$1,001 - $15,000")
  const amountText = cleanText(
    first(row, ["amount", "amountRange", "disclosureAmount"])
  );

  // explicit transaction value, or compute price * shares if both present
  const value =
    num(first(row, ["transactionValue", "value", "dollarValue"])) ??
    (price != null && shares != null ? price * shares : undefined);

  const date = String(first(row, ["transactionDate", "date"]) || "").slice(0, 10);
  const filed = String(first(row, ["disclosureDate", "filingDate"]) || "");
  const link = first(row, ["link", "url", "source"]) || "";

  return {
    date,
    filed,
    member,
    ticker,
    company,
    action,
    shares,
    price,
    value,
    amountText,
    owner: first(row, ["owner"]) || "",
    link,
    raw: row,
  };
}

async function fetchFirstWorking(paths: string[], params: URLSearchParams) {
  for (const p of paths) {
    const url = `${BASE}${p}?${params.toString()}`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) continue;
    const js = await res.json();
    if (Array.isArray(js)) return js;
    if (Array.isArray(js?.data)) return js.data;
  }
  return [];
}

export async function GET(req: Request) {
  try {
    if (!FMP_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing FMP_API_KEY" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const chamber = (searchParams.get("chamber") || "senate").toLowerCase() as
      | "senate"
      | "house";
    const qMember = (searchParams.get("member") || "").trim().toLowerCase();
    const qTicker = (searchParams.get("ticker") || "").trim().toUpperCase();
    const qText = (searchParams.get("q") || "").trim().toLowerCase();
    const from = (searchParams.get("from") || "").slice(0, 10);
    const to = (searchParams.get("to") || "").slice(0, 10);

    const qp = new URLSearchParams();
    if (qTicker) qp.set("symbol", qTicker);
    if (from) qp.set("from", from);
    if (to) qp.set("to", to);
    qp.set("page", "0");
    qp.set("apikey", FMP_KEY);

    // Try several endpoints; FMP accounts differ
    const raw =
      chamber === "senate"
        ? await fetchFirstWorking(SENATE_PATHS, qp)
        : await fetchFirstWorking(HOUSE_PATHS, qp);

    const rows = raw.map((r: any) => normalizeRow(r, chamber));

    // local filters
    const filtered = rows.filter((r) => {
      const okMember = !qMember || r.member.toLowerCase().includes(qMember);
      const okText =
        !qText ||
        r.member.toLowerCase().includes(qText) ||
        r.ticker.toLowerCase().includes(qText) ||
        (r.company || "").toLowerCase().includes(qText);
      return okMember && okText;
    });

    return NextResponse.json({ ok: true, rows: filtered });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}