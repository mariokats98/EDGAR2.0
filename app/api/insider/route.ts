// app/api/insider/route.ts
import { NextResponse } from "next/server";

/**
 * Search insider (reporting owner) filings across all issuers by owner name.
 * Example: /api/insider?owner=Jensen%20Huang&count=100
 * Returns forms 3/4/5 with links & dates, newest first.
 */

const UA = process.env.SEC_USER_AGENT || "HerevnaBot/1.0 (admin@herevna.io)";

type Out = {
  form: string;        // 3 / 4 / 5
  filed_at: string;    // yyyy-mm-dd
  title: string;       // feed entry title
  index_url: string;   // SEC index (entry link)
  primary_doc_url: string | null; // best-effort
  company?: string;    // issuer (if available in title)
  owner?: string;      // reporting owner (query)
};

function getText(node: Element | null, sel: string) {
  const el = node?.querySelector(sel);
  return el?.textContent?.trim() || "";
}
function toDateISO(s: string) {
  // example "2024-08-16T17:05:00-04:00" -> "2024-08-16"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const owner = (searchParams.get("owner") || "").trim();
    const count = Math.min(200, Math.max(20, parseInt(searchParams.get("count") || "100", 10)));
    if (!owner) {
      return NextResponse.json({ error: "Missing 'owner' query" }, { status: 400 });
    }

    // We’ll pull 3, 4, and 5 and merge.
    const kinds = ["3", "4", "5"];
    const all: Out[] = [];

    for (const type of kinds) {
      const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&owner=only&company=${encodeURIComponent(
        owner
      )}&type=${encodeURIComponent(type)}&count=${count}&output=atom`;

      const r = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/atom+xml, text/xml" },
        cache: "no-store",
      });
      if (!r.ok) continue;
      const xml = await r.text();

      // parse in a DOM to read <entry>
      const dom = new (global as any).DOMParser
        ? new DOMParser().parseFromString(xml, "text/xml")
        : null;

      // If DOMParser not available in edge runtime, use a light regex fallback:
      if (!dom) {
        const entries = xml.split("<entry>").slice(1);
        for (const chunk of entries) {
          const title = (chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
          const updated = (chunk.match(/<updated>([^<]+)<\/updated>/i)?.[1] || "").trim();
          const link = (chunk.match(/<link[^>]+href="([^"]+)"/i)?.[1] || "").trim();
          const filed_at = toDateISO(updated);
          const form = (title.match(/\b(?:FORM|Form)\s+(3|4|5)\b/)?.[1] || type).toUpperCase();

          all.push({
            form,
            filed_at,
            title: title || `${owner} • Form ${form}`,
            index_url: link || "",
            primary_doc_url: null,
            owner,
          });
        }
      } else {
        const entries = dom.querySelectorAll("entry");
        entries.forEach((en: any) => {
          const title = getText(en, "title");
          const updated = getText(en, "updated");
          const linkEl = en.querySelector("link");
          const href = linkEl?.getAttribute("href") || "";
          const filed_at = toDateISO(updated);
          const m = title.match(/\b(?:FORM|Form)\s+(3|4|5)\b/);
          const form = (m?.[1] || type).toUpperCase();

          all.push({
            form,
            filed_at,
            title: title || `${owner} • Form ${form}`,
            index_url: href,
            primary_doc_url: null,
            owner,
          });
        });
      }
    }

    // Sort newest first
    all.sort((a, b) => (a.filed_at < b.filed_at ? 1 : a.filed_at > b.filed_at ? -1 : 0));

    return NextResponse.json({ owner, total: all.length, data: all.slice(0, count) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

