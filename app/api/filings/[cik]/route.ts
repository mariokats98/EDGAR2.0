import { NextResponse } from "next/server";

/**
 * Fast, filterable EDGAR filings API with optional caching and concurrency limiting.
 * Query params:
 *   - max: number (default 150, max 2000)
 *   - offset: number (default 0) for pagination
 *   - from: YYYY-MM-DD (inclusive)
 *   - to:   YYYY-MM-DD (inclusive)
 *   - form: one of ["8-K","10-Q","10-K","S1","sec16"]
 *   - fast: "1" to skip primary-document parsing (MUCH faster)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* --------------------------- SEC + helpers --------------------------- */

const DEFAULT_USER_AGENT = "EDGARCards/1.0 (youremail@example.com)";
const SEC_HEADERS: Record<string, string> = {
  "User-Agent": process.env.SEC_USER_AGENT || DEFAULT_USER_AGENT,
  "Accept": "application/json",
};

function zeroPadCIK(raw: string) {
  const s = String(raw || "").replace(/\D/g, "");
  return s.padStart(10, "0");
}
function isHtmlLike(url: string) {
  const u = url.toLowerCase();
  return u.endsWith(".htm") || u.endsWith(".html") || u.endsWith(".txt");
}
function isXmlLike(url: string) {
  return url.toLowerCase().endsWith(".xml");
}

/** Extract common 8-K “Item X.XX” mentions and friendly badges. */
function detectItems(text: string) {
  const found = text.match(/Item\s+\d{1,2}\.\d{2}/gi) || [];
  const items = Array.from(new Set(found));
  const lower = new Set(items.map((s) => s.toLowerCase()));
  const badges: string[] = [];
  if (lower.has("item 1.01")) badges.push("Material Agreement (Item 1.01)");
  if (lower.has("item 2.02")) badges.push("Results of Operations (Item 2.02)");
  if (lower.has("item 5.02")) badges.push("Executive Change (Item 5.02)");
  return { items, badges };
}

/** Roughly find the largest $ amount in S-1/424B prose. */
function extractLargestAmount(text: string): number | null {
  const re = /\$?\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(million|billion|m|bn)?/gi;
  let max: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let num = parseFloat(m[1].replace(/,/g, ""));
    const unit = (m[2] || "").toLowerCase();
    if (unit === "billion" || unit === "bn") num *= 1_000_000_000;
    if (unit === "million" || unit === "m") num *= 1_000_000;
    if (!Number.isFinite(num)) continue;
    if (max === null || num > max) max = num;
  }
  return max;
}

/** Parse Section 16 XML for owner roles + names. */
function extractOwnerFromXml(xml: string) {
  const getBool = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
    return m ? /true/i.test(m[1]) : false;
  };
  const getText = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
    return m ? m[1].trim() : null;
  };

  const ownerNames: string[] = [];
  const blocks = xml.match(/<reportingOwner>[\s\S]*?<\/reportingOwner>/gi) || [];
  for (const b of blocks) {
    const m = b.match(/<rptOwnerName>([\s\S]*?)<\/rptOwnerName>/i);
    if (m) {
      const nm = m[1].replace(/\s+/g, " ").trim();
      if (nm) ownerNames.push(nm);
    }
  }

  const roles: string[] = [];
  if (getBool("isDirector")) roles.push("Director");
  if (getBool("isOfficer")) {
    const title = getText("officerTitle");
    roles.push(title ? `Officer (${title})` : "Officer");
  }
  if (getBool("isTenPercentOwner")) roles.push("10% Owner");

  return { roles, ownerNames: Array.from(new Set(ownerNames)) };
}

/* ---------------------------- Optional cache ---------------------------- */

let redis: any = null;
try {
  // Lazy import — compile-time safe if not installed
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Redis } = require("@upstash/redis");
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch {
  // Upstash not installed — caching disabled (still works fine)
}

async function cachedFetchJSON<T>(url: string, headers: Record<string, string>, ttlSec = 3600): Promise<T> {
  const key = `sec:json:${url}`;
  if (redis) {
    const cached = await redis.get<string>(key);
    if (cached) return JSON.parse(cached) as T;
  }
  const r = await fetch(url, { headers, cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
  const json = (await r.json()) as T;
  if (redis) await redis.set(key, JSON.stringify(json), { ex: ttlSec });
  return json;
}

async function cachedFetchText(url: string, headers: Record<string, string>, ttlSec = 6 * 3600): Promise<string> {
  const key = `sec:text:${url}`;
  if (redis) {
    const cached = await redis.get<string>(key);
    if (cached) return cached;
  }
  const r = await fetch(url, { headers, cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
  const text = await r.text();
  if (redis) await redis.set(key, text, { ex: ttlSec });
  return text;
}

/* ---------------------------- Concurrency ---------------------------- */

async function withLimit<T>(pool: number, tasks: (() => Promise<T>)[]) {
  const out: T[] = new Array(tasks.length);
  let i = 0;
  const workers = new Array(Math.max(1, pool)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= tasks.length) return;
      out[idx] = await tasks[idx]();
    }
  });
  await Promise.all(workers);
  return out;
}

/* ------------------------- Load filings (deep) ------------------------- */

type Row = {
  form: string;
  filingDate: string;      // YYYY-MM-DD
  accessionNumber: string; // with dashes
  primaryDocument?: string;
};

async function loadAllFilings(cik10: string, hostHint?: string): Promise<{ rows: Row[]; company?: string }> {
  const baseUrl = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const headers: Record<string, string> = {
    ...SEC_HEADERS,
    ...(hostHint ? { Referer: `https://${hostHint}` } : {}),
  };

  const data = await cachedFetchJSON<any>(baseUrl, headers, 6 * 3600);

  const rows: Row[] = [];

  // 1) “recent”
  const recent = data?.filings?.recent ?? {};
  const len = (recent?.accessionNumber || []).length | 0;
  for (let i = 0; i < len; i++) {
    rows.push({
      form: String(recent.form?.[i] || ""),
      filingDate: String(recent.filingDate?.[i] || ""),
      accessionNumber: String(recent.accessionNumber?.[i] || ""),
      primaryDocument: recent.primaryDocument?.[i] || undefined,
    });
  }

  // 2) yearly archives
  const files = Array.isArray(data?.filings?.files) ? data.filings.files : [];
  for (const f of files) {
    const name = f?.name ? String(f.name) : null; // e.g., "CIK0000320193-2021.json"
    if (!name) continue;
    const yearlyUrl = `https://data.sec.gov/submissions/${name}`;
    try {
      const yjson = await cachedFetchJSON<any>(yearlyUrl, headers, 24 * 3600);
      const fl = Array.isArray(yjson?.filings) ? yjson.filings : [];
      for (const row of fl) {
        rows.push({
          form: String(row.form || ""),
          filingDate: String(row.filingDate || ""),
          accessionNumber: String(row.accessionNumber || ""),
          primaryDocument: row.primaryDocument || undefined,
        });
      }
    } catch {
      // ignore one bad year
    }
  }

  // de-dup + sort desc by date
  const seen = new Set<string>();
  const dedup: Row[] = [];
  for (const r of rows) {
    const acc = r.accessionNumber.replace(/-/g, "");
    if (seen.has(acc)) continue;
    seen.add(acc);
    dedup.push(r);
  }
  dedup.sort((a, b) => (a.filingDate > b.filingDate ? -1 : a.filingDate < b.filingDate ? 1 : 0));

  return { rows: dedup, company: data?.name || undefined };
}

/* ------------------------------- Handler ------------------------------- */

export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    const cik10 = zeroPadCIK(params.cik || "");

    // robust URL parsing (handles relative in some runtimes)
    let urlObj: URL;
    try {
      urlObj = new URL(req.url);
    } catch {
      urlObj = new URL(`http://local${req.url.startsWith("/") ? "" : "/"}${req.url}`);
    }
    const search = urlObj.searchParams;
    const host = urlObj.host;

    // query params
    const maxParam = Number(search.get("max") || "150");
    const max = Math.max(1, Math.min(2000, isFinite(maxParam) ? maxParam : 150));

    const offsetParam = Number(search.get("offset") || "0");
    const offset = Math.max(0, isFinite(offsetParam) ? offsetParam : 0);

    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const fromIn = search.get("from");
    const toIn = search.get("to");
    const fromISO = fromIn && ISO.test(fromIn) ? fromIn : null;
    const toISO = toIn && ISO.test(toIn) ? toIn : null;

    const fast = (search.get("fast") || "0") === "1";
    const formParam = (search.get("form") || "").toUpperCase(); // "8-K","10-Q","10-K","S1","SEC16"

    // load full history
    const { rows, company } = await loadAllFilings(cik10, host);

    // server-side filters
    let filtered = rows;

    // date filter first (inclusive)
    if (fromISO) filtered = filtered.filter((r) => r.filingDate >= fromISO);
    if (toISO)   filtered = filtered.filter((r) => r.filingDate <= toISO);

    // form filter
    if (formParam) {
      filtered = filtered.filter((r) => {
        const f = (r.form || "").toUpperCase();
        if (formParam === "S1") return f.startsWith("S-1") || f.startsWith("424B");
        if (formParam === "SEC16") return f === "3" || f === "4" || f === "5";
        return f === formParam; // 8-K / 10-Q / 10-K
      });
    }

    // pagination window AFTER filtering
    const windowed = filtered.slice(offset, offset + max);

    // build results; optionally parse primary docs (skip in fast mode)
    const cikNoPad = String(parseInt(cik10, 10));

    const tasks = windowed.map((r) => async () => {
      const accNoDash = r.accessionNumber.replace(/-/g, "");
      const base = `https://www.sec.gov/Archives/edgar/data/${cikNoPad}/${accNoDash}`;
      const primary = r.primaryDocument ? `${base}/${r.primaryDocument}` : null;
      const formU = (r.form || "").toUpperCase();

      let items: string[] = [];
      let badges: string[] = [];
      let amount_usd: number | null = null;
      let owner_roles: string[] = [];
      let owner_names: string[] = [];

      // Only fetch primary when needed and not in fast mode
      const needsDetails =
        !fast &&
        primary &&
        (
          formU.startsWith("8-K") ||
          formU === "3" || formU === "4" || formU === "5" ||
          formU.startsWith("S-1") || formU.startsWith("424B")
        );

      if (needsDetails && primary) {
        try {
          const content = await cachedFetchText(primary, { "User-Agent": SEC_HEADERS["User-Agent"] as string }, 6 * 3600);

          if (isHtmlLike(primary) && formU.startsWith("8-K")) {
            const text = content.replace(/<[^>]+>/g, " ");
            const found = detectItems(text);
            items = found.items;
            badges = found.badges;
          }

          if (isHtmlLike(primary) && (formU.startsWith("S-1") || formU.startsWith("424B"))) {
            const text = content.replace(/<[^>]+>/g, " ");
            amount_usd = extractLargestAmount(text);
          }

          if (isXmlLike(primary) && (formU === "3" || formU === "4" || formU === "5")) {
            const parsed = extractOwnerFromXml(content);
            owner_roles = parsed.roles;
            owner_names = parsed.ownerNames;
          }
        } catch {
          // ignore per-filing detail failure
        }
      }

      return {
        cik: cik10,
        company,
        form: r.form,
        filed_at: r.filingDate,
        title: `${company ? company + " • " : ""}${r.form} • ${r.filingDate}`,
        source_url: base,
        primary_doc_url: primary,
        items,
        badges,
        amount_usd,
        owner_roles,
        owner_names,
      };
    });

    // Concurrency limit only matters when details are needed; keep small (6)
    const results = (!fast ? await withLimit(6, tasks) : await Promise.all(tasks));

    return NextResponse.json(results, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
