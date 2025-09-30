import { NextResponse } from "next/server";

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
const first = (row: any, keys: string[]): any => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

const toNum = (v: any): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(String(v).replace(/[,$]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

const clean = (s?: string) => (s || "").replace(/\s+/g, " ").trim();

const cap = (s?: string) =>
  clean(s)
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());

function buildMember(row: any, chamber: "senate" | "house") {
  // direct single-field variants
  const direct =
    first(row, [
      chamber === "senate" ? "senator" : "representative",
      "member",
      "politician",
      "politicianName",
      "congressPerson",
      "congressperson",
      "congress_person",
      "name",
      "trader",
      "reportingOwner",
      "ownerName",
      "person",
    ]) || "";

  // split first/last variants
  const fn =
    first(row, [
      "firstName",
      "firstname",
      "first_name",
      "first",
      "givenName",
      "given_name",
    ]) || "";
  const ln =
    first(row, [
      "lastName",
      "lastname",
      "last_name",
      "surname",
      "familyName",
      "family_name",
      "last",
    ]) || "";

  const composed = clean([fn, ln].filter(Boolean).join(" "));

  // sometimes owner contains relationship like "Spouse: Nancy Pelosi"
  const owner = clean(first(row, ["owner", "ownerType"]) || "");
  const ownerExtract =
    /([A-Z][a-z]+(?: [A-Z]\.)?(?: [A-Z][a-z]+)+)/.exec(owner)?.[1] || "";

  const finalName = clean(direct) || composed || ownerExtract;

  return cap(finalName) || ""; // Title Case for consistency
}

function toAction(v: any): string {
  const t = String(v || "").toUpperCase();
  if (!t) return "";
  if (t.startsWith("S")) return "S-SALE";
  if (t.startsWith("P") || t.includes("PUR")) return "P-PURCHASE";
  return t;
}

function normalizeRow(row: any, chamber: "senate" | "house") {
  const member = buildMember(row, chamber);

  const ticker = String(first(row, ["symbol", "ticker"]) || "").toUpperCase();

  const company =
    clean(
      first(row, [
        "assetDescription",
        "assetName",
        "securityName",
        "company",
        "security",
      ])
    ) || "";

  const action = toAction(first(row, ["transaction", "type", "action"]));

  const price =
    toNum(
      first(row, [
        "price",
        "pricePerShare",
        "sharePrice",
        "priceShare",
        "transactionPrice",
        "unitPrice",
      ])
    ) ?? undefined;

  const shares =
    toNum(
      first(row, [
        "shares",
        "share",
        "volume",
        "amountOfShares",
        "amount_shares",
        "qty",
        "quantity",
        "units",
      ])
    ) ?? undefined;

  const amountText = clean(
    first(row, ["amount", "amountRange", "disclosureAmount"])
  );

  const value =
    toNum(first(row, ["transactionValue", "value", "dollarValue"])) ??
    (price != null && shares != null ? price * shares : undefined);

  const date =
    String(
      first(row, [
        "transactionDate",
        "date",
        "transaction_date",
        "reportedDate",
      ]) || ""
    ).slice(0, 10);

  const filed =
    String(first(row, ["disclosureDate", "filingDate", "reportDate"]) || "") ||
    "";

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

    const raw =
      chamber === "senate"
        ? await fetchFirstWorking(SENATE_PATHS, qp)
        : await fetchFirstWorking(HOUSE_PATHS, qp);

    const rows = raw.map((r: any) => normalizeRow(r, chamber));

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