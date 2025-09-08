// app/api/filings/[cik]/route.ts
import { NextResponse } from "next/server";

const UA = process.env.SEC_USER_AGENT || "HerevnaBot/1.0 (admin@herevna.io)";
const pad = (s: string) => String(s || "").padStart(10, "0");

type Out = {
  cik: string;
  company: string;
  form: string;
  filed_at: string;
  title: string;
  index_url: string;
  primary_doc_url: string | null;
  owner_names?: string[]; // for Forms 3/4/5 when owner filter is used
};

function parseDate(s?: string) {
  // expects YYYY-MM-DD
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function dateInRange(s: string, start?: Date | null, end?: Date | null) {
  const d = parseDate(s);
  if (!d) return false;
  if (start && d < start) return false;
  if (end   && d > end) return false;
  return true;
}

function looksXml(url: string | null) {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.endsWith(".xml");
}

/** Extract <rptOwnerName>…</rptOwnerName> for Forms 3/4/5 owner XML */
async function maybeExtractOwners(primaryUrl: string | null): Promise<string[] | null> {
  if (!looksXml(primaryUrl)) return null;
  try {
    const r = await fetch(primaryUrl!, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!r.ok) return null;
    const xml = await r.text();
    const names = Array.from(xml.matchAll(/<rptOwnerName>\s*([^<]+)\s*<\/rptOwnerName>/gi)).map(m => m[1].trim());
    const uniq = [...new Set(names)].filter(Boolean);
    return uniq.length ? uniq : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    const cik10 = pad(params.cik);
    if (!/^\d{10}$/.test(cik10)) {
      return NextResponse.json({ error: "Invalid CIK" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);

    // Filters
    const formsParam = (searchParams.get("forms") || "").trim(); // e.g. "8-K,10-Q,10-K,3,4,5,13D,13G,6-K,S-1,424B"
    const formSet = new Set(
      formsParam
        ? formsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
        : []
    );

    const ownerQuery = (searchParams.get("owner") || "").trim().toLowerCase(); // for 3/4/5
    const startStr = searchParams.get("start") || ""; // YYYY-MM-DD
    const endStr   = searchParams.get("end")   || "";
    const start = parseDate(startStr);
    const end   = parseDate(endStr);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(10, parseInt(searchParams.get("pageSize") || "25", 10)));

    const profileUrl = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    const r = await fetch(profileUrl, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store"
    });
    if (!r.ok) return NextResponse.json({ error: `SEC fetch failed (${r.status})` }, { status: 502 });
    const data = await r.json();

    const company = data?.name || "Company";
    const recent = data?.filings?.recent ?? {};
    const totalN = (recent?.accessionNumber || []).length;

    // Build raw list first (limit to a sane max to keep latency down)
    const MAX_PULL = Math.min(totalN, 200); // grab up to 200 most recent, then filter/paginate
    const rows: Out[] = [];
    for (let i = 0; i < MAX_PULL; i++) {
      const form = String(recent.form[i] || "").toUpperCase();
      const filed_at = String(recent.filingDate[i] || "");
      const accDash = String(recent.accessionNumber[i] || "");
      const acc = accDash.replace(/-/g, "");
      const primary = recent.primaryDocument[i] || null;
      const cikNum = parseInt(cik10, 10);
      const base = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}`;
      const indexUrl = `${base}/${accDash}-index.htm`;
      const primaryUrl = primary ? `${base}/${primary}` : null;

      rows.push({
        cik: cik10,
        company,
        form,
        filed_at,
        title: `${company} • ${form} • ${filed_at}`,
        index_url: indexUrl,
        primary_doc_url: primaryUrl,
      });
    }

    // Apply form filter
    let filtered = rows;
    if (formSet.size) {
      filtered = filtered.filter(r => {
        // Allow prefix match for groups like "424B"
        for (const f of formSet) {
          if (r.form === f || r.form.startsWith(f)) return true;
        }
        return false;
      });
    }

    // Apply date filter
    if (start || end) {
      filtered = filtered.filter(r => dateInRange(r.filed_at, start, end));
    }

    // Apply insider owner filter (only for 3/4/5; we fetch XML only if ownerQuery present)
    if (ownerQuery) {
      const isOwnerForm = (f: string) => ["3", "4", "5"].some(p => f === p || f.startsWith(p + "/") || f.startsWith(p + "A"));
      const candidates = filtered.filter(r => isOwnerForm(r.form));

      // Fetch owner names for candidates in parallel but limit concurrency a bit
      const BATCH = 8;
      let idx = 0;
      const augmented: Out[] = [];
      async function runBatch() {
        const slice = candidates.slice(idx, idx + BATCH);
        await Promise.all(
          slice.map(async (it) => {
            const owners = await maybeExtractOwners(it.primary_doc_url);
            if (owners) (it as any).owner_names = owners;
          })
        );
        idx += BATCH;
        if (idx < candidates.length) await runBatch();
      }
      await runBatch();

      filtered = filtered.filter(it => {
        const owners = (it as any).owner_names as string[] | undefined;
        if (!owners || owners.length === 0) return false;
        return owners.some(n => n.toLowerCase().includes(ownerQuery));
      });
    }

    // Sort desc by date (newest first)
    filtered.sort((a, b) => (a.filed_at < b.filed_at ? 1 : a.filed_at > b.filed_at ? -1 : 0));

    // Pagination
    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pageCount);
    const startIdx = (safePage - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);

    return NextResponse.json({
      meta: {
        cik: cik10,
        company,
        total,
        page: safePage,
        pageSize,
        pageCount,
      },
      data: pageItems,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
