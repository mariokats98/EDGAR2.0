import { NextResponse } from "next/server";

export const revalidate = 0;
export const dynamic = "force-dynamic";

type Headline = { title: string; link: string; pubDate?: string; source: string };

const PAGES = [
  // Master list of “Economic News Releases”
  "https://www.bls.gov/bls/newsrels.htm",
  // Hub + many category pages linked from here
  "https://www.bls.gov/news.release/",
];

function UA() {
  return (
    process.env.BLS_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 HerevnaBot/1.0 (contact@herevna.io)"
  );
}

async function fetchText(url: string) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA(),
        "Accept": "text/html,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!r.ok) throw new Error(`Fetch ${url} -> ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(to);
  }
}

function parseHtmlForReleases(html: string, pageUrl: string): Headline[] {
  // Capture links pointing into /news.release/… (category pages + individual releases)
  const anchors =
    html.match(
      /<a[^>]+href="(\/news\.release\/[^"#]+|https?:\/\/www\.bls\.gov\/news\.release\/[^"#]+)"[^>]*>[\s\S]*?<\/a>/gi
    ) || [];
  const seen = new Set<string>();
  const out: Headline[] = [];

  for (const a of anchors) {
    const href =
      a.match(/href="([^"]+)"/i)?.[1] ||
      a.match(/HREF="([^"]+)"/)?.[1];
    if (!href) continue;

    const title = a.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!title) continue;

    // Normalize to absolute
    const link = href.startsWith("http")
      ? href
      : `https://www.bls.gov${href}`;

    const key = `${title}::${link}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ title, link, source: pageUrl });
  }
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "40") || 40));
  const debug = searchParams.get("debug") === "1";

  try {
    // Pull from both pages and merge
    const pages = await Promise.allSettled(PAGES.map(async (u) => ({ u, html: await fetchText(u) })));

    let items: Headline[] = [];
    const used: string[] = [];

    for (const p of pages) {
      if (p.status === "fulfilled") {
        const { u, html } = p.value;
        const parsed = parseHtmlForReleases(html, u);
        if (parsed.length) {
          items.push(...parsed);
          used.push(u);
        }
      }
    }

    // De-dup and keep latest-ish ordering (BLS pages are already newest-first)
    const dedup = new Map<string, Headline>();
    for (const h of items) {
      const k = `${h.title}::${h.link}`;
      if (!dedup.has(k)) dedup.set(k, h);
    }
    items = Array.from(dedup.values());

    // Optional filter (only if q has 2+ chars so we don’t accidentally hide everything)
    if (q.length >= 2) {
      items = items.filter((h) => h.title.toLowerCase().includes(q));
    }

    // Basic prioritization: keep direct release pages (…/news.release/xxx.htm) near top
    items.sort((a, b) => {
      const ad = /\/news\.release\/[^/]+\.htm$/i.test(a.link) ? 0 : 1;
      const bd = /\/news\.release\/[^/]+\.htm$/i.test(b.link) ? 0 : 1;
      return ad - bd;
    });

    items = items.slice(0, limit);

    if (debug) {
      return NextResponse.json({
        used,
        count: items.length,
        sample: items.slice(0, 5),
      });
    }

    if (!items.length) {
      return NextResponse.json({ error: "No headlines found on BLS pages.", data: [] }, { status: 502 });
    }

    return NextResponse.json({ data: items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error", data: [] }, { status: 500 });
  }
}
