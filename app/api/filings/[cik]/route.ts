import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- SEC headers (identify yourself per SEC fair-use guidance) ---
const DEFAULT_USER_AGENT = "EDGARCards/1.0 (youremail@example.com)";
const SEC_HEADERS = {
  "User-Agent": process.env.SEC_USER_AGENT || DEFAULT_USER_AGENT,
  "Accept": "application/json",
};

// --- helpers ---
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
function detectItems(text: string) {
  const found = text.match(/Item\s+\d{1,2}\.\d{2}/gi) || [];
  const items = Array.from(new Set(found));
  const lower = new Set(items.map(s => s.toLowerCase()));
  const badges: string[] = [];
  if (lower.has("item 1.01")) badges.push("Material Agreement (Item 1.01)");
  if (lower.has("item 2.02")) badges.push("Results of Operations (Item 2.02)");
  if (lower.has("item 5.02")) badges.push("Executive Change (Item 5.02)");
  return { items, badges };
}
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
  // there can be multiple reportingOwner blocks
  const ownerNames: string[] = [];
  const blocks = xml.match(/<reportingOwner>[\s\S]*?<\/reportingOwner>/gi) || [];
  for (const b of blocks) {
    const m = b.match(/<rptOwnerName>([\s\S]*?)<\/rptOwnerName>/i);
    if (m) {
      const nm = m[1].replace(/\s+/g, " ").trim();
      if (nm) ownerNames.push(nm);
    }
  }
  const isDirector = getBool("isDirector");
  const isOfficer = getBool("isOfficer");
  const isTen = getBool("isTenPercentOwner");
  const officerTitle = getText("officerTitle");
  const roles: string[] = [];
  if (isDirector) roles.push("Director");
  if (isOfficer) roles.push(officerTitle ? `Officer (${officerTitle})` : "Officer");
  if (isTen) roles.push("10% Owner");
  return { roles, ownerNames: Array.from(new Set(ownerNames)) };
}

type Row = {
  form: string;
  filingDate: string;       // YYYY-MM-DD
  accessionNumber: string;  // 0000-... style
  primaryDocument?: string;
};

async function loadAllFilings(cik10: string, hostHint?: string): Promise<{ rows: Row[]; company?: string }> {
  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const headers: Record<string, string> = {
    ...SEC_HEADERS,
    ...(hostHint ? { Referer: `https://${hostHint}` } : {}),
  };

  const r = await fetch(url, { headers, cache: "no-store" });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`SEC submissions fetch failed ${r.status}: ${body.slice(0, 120)}`);
  }
  const data = await r.json();

  const rows: Row[] = [];

  // 1) recent arrays
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

  // 2) yearly files
  const files = Array.isArray(data?.filings?.files) ? data.filings.files : [];
  for (const f of files) {
    const name = f?.name ? String(f.name) : null; // e.g. "CIK0000320193-2021.json"
    if (!name) continue;
    const yearlyUrl = `https://data.sec.gov/submissions/${name}`;
    try {
      const yr = await fetch(yearlyUrl, { headers, cache: "no-store" });
      if (!yr.ok) continue;
      const yjson = await yr.json();
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
      // ignore a single bad year
    }
  }

  // de-dup by accessionNumber (strip dashes), sort desc by date
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

export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    // sanitize path param
    const cik10 = zeroPadCIK(params.cik);

    // robust URL parsing (some runtimes pass relative urls)
    let urlObj: URL;
    try {
      urlObj = new URL(req.url);
    } catch {
      urlObj = new URL(`http://local${req.url.startsWith("/") ? "" : "/"}${req.url}`);
    }
    const searchParams = urlObj.searchParams;
    const host = urlObj.host;

    // query params
    const maxParam = Number(searchParams.get("max") || "300");
    const max = Math.max(1, Math.min(2000, isFinite(maxParam) ? maxParam : 300));

    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const fromIn = searchParams.get("from");
    const toIn = searchParams.get("to");
    const fromISO = fromIn && ISO.test(fromIn) ? fromIn : null;
    const toISO = toIn && ISO.test(toIn) ? toIn : null;

    // fetch all filings (recent + yearly)
    const { rows, company } = await loadAllFilings(cik10, host);

    // server-side date filter BEFORE slicing
    let filtered = rows;
    if (fromISO) filtered = filtered.filter(r => r.filingDate >= fromISO);
    if (toISO)   filtered = filtered.filter(r => r.filingDate <= toISO);

    // slice to max AFTER filtering
    const selected = filtered.slice(0, max);

    // assemble output with light doc parsing
    const cikNoPad = String(parseInt(cik10, 10));
    const out: any[] = [];

    for (const r of selected) {
      const accNoDash = r.accessionNumber.replace(/-/g, "");
      const base = `https://www.sec.gov/Archives/edgar/data/${cikNoPad}/${accNoDash}`;
      const primary = r.primaryDocument ? `${base}/${r.primaryDocument}` : null;
      const formU = r.form.toUpperCase();

      let items: string[] = [];
      let badges: string[] = [];
      let amount_usd: number | null = null;
      let owner_roles: string[] = [];
      let owner_names: string[] = [];

      if (primary) {
        try {
          const pr = await fetch(primary, { headers: { "User-Agent": SEC_HEADERS["User-Agent"] as string } });
          if (pr.ok) {
            const content = await pr.text();

            // 8-K: detect items/badges from HTML-ish content
            if (isHtmlLike(primary) && formU.startsWith("8-K")) {
              const text = content.replace(/<[^>]+>/g, " ");
              const found = detectItems(text);
              items = found.items;
              badges = found.badges;
            }

            // S-1 / 424B: rough largest $ amount
            if (isHtmlLike(primary) && (formU.startsWith("S-1") || formU.startsWith("424B"))) {
              const text = content.replace(/<[^>]+>/g, " ");
              amount_usd = extractLargestAmount(text);
            }

            // Section 16 (3/4/5): parse XML owner roles and names
            if (isXmlLike(primary) && (formU === "3" || formU === "4" || formU === "5")) {
              const parsed = extractOwnerFromXml(content);
              owner_roles = parsed.roles;
              owner_names = parsed.ownerNames;
            }
          }
        } catch {
          // ignore a single filing parse error
        }
      }

      out.push({
        cik: cik10,
        company: company,
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
      });
    }

    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
