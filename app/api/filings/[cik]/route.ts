import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_USER_AGENT = "EDGARCards/1.0 (youremail@example.com)";
const SEC_HEADERS = {
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

function detectItems(text: string) {
  const found = text.match(/Item\s+\d{1,2}\.\d{2}/gi) || [];
  const items = Array.from(new Set(found));
  const lower = new Set(items.map(s => s.toLowerCase()));
  const badges: string[] = [];
  if (lower.has("item 1.01")) badges.push("Material Agreement (Item 1.01)");
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

/** Parse Section 16 XML for reporting owner relationships. */
function extractOwnerRoles(xml: string) {
  const getBool = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"));
    return m ? /true/i.test(m[1]) : false;
  };
  const getText = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"));
    return m ? m[1].trim() : null;
  };

  const isDirector = getBool("isDirector");
  const isOfficer = getBool("isOfficer");
  const isTen = getBool("isTenPercentOwner");
  const officerTitle = getText("officerTitle");

  const roles: string[] = [];
  if (isDirector) roles.push("Director");
  if (isOfficer) roles.push(officerTitle ? `Officer (${officerTitle})` : "Officer");
  if (isTen) roles.push("10% Owner");

  return roles;
}

export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    const cik10 = zeroPadCIK(params.cik);
    const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;

    const r = await fetch(url, { headers: SEC_HEADERS, cache: "no-store" });
    const raw = await r.text();

    if (!r.ok) {
      return NextResponse.json(
        { error: `SEC fetch failed`, status: r.status, bodySnippet: raw.slice(0, 200) },
        { status: 502 }
      );
    }

    let data: any;
    try { data = JSON.parse(raw); }
    catch {
      return NextResponse.json(
        { error: "SEC returned non-JSON", status: r.status, bodySnippet: raw.slice(0, 200) },
        { status: 502 }
      );
    }

    const name = data?.name || data?.entityType || "Company";
    const recent = data?.filings?.recent ?? {};
    const total = Math.min(20, (recent?.accessionNumber ?? []).length || 0);

    const urlObj = new URL(req.url);
    const relOnly = urlObj.searchParams.get("relOnly") === "1"; // if you add a UI toggle later

    if (!total) {
      return NextResponse.json([], { status: 200 });
    }

    const out: any[] = [];
    for (let i = 0; i < total; i++) {
      const form = String(recent.form[i] || "");
      const filed_at = recent.filingDate?.[i] || "";
      const acc = (recent.accessionNumber?.[i] || "").replace(/-/g, "");
      const primary = recent.primaryDocument?.[i] || null;

      const cikNoPad = String(parseInt(cik10, 10));
      const base = `https://www.sec.gov/Archives/edgar/data/${cikNoPad}/${acc}`;
      const primaryUrl = primary ? `${base}/${primary}` : null;

      let items: string[] = [];
      let badges: string[] = [];
      let amount_usd: number | null = null;
      let owner_roles: string[] = [];

      if (primaryUrl) {
        try {
          const t = await fetch(primaryUrl, { headers: { "User-Agent": SEC_HEADERS["User-Agent"] as string } });
          if (t.ok) {
            const content = await t.text();

            // Form-specific parsing
            const F = form.toUpperCase();

            // For 8-K, detect items & badges from HTML-ish content
            if (isHtmlLike(primaryUrl) && F.startsWith("8-K")) {
              const text = content.replace(/<[^>]+>/g, " ");
              const found = detectItems(text);
              items = found.items;
              badges = found.badges;
            }

            // For S-1 / 424B*, try to pull a big $ amount
            if (isHtmlLike(primaryUrl) && (F.startsWith("S-1") || F.startsWith("424B"))) {
              const text = content.replace(/<[^>]+>/g, " ");
              amount_usd = extractLargestAmount(text);
            }

            // For Section 16 (3/4/5), parse XML <reportingOwnerRelationship>
            if (isXmlLike(primaryUrl) && (F === "3" || F === "4" || F === "5")) {
              owner_roles = extractOwnerRoles(content);
            }
          }
        } catch {
          // ignore fetch/parsing errors; still return the filing row
        }
      }

      out.push({
        cik: cik10,
        company: name,
        form,
        filed_at,
        title: `${name} • ${form} • ${filed_at}`,
        source_url: base,
        primary_doc_url: primaryUrl,
        items,
        badges,
        amount_usd,
        owner_roles
      });
    }

    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
