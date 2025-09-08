// app/api/bls/releases/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";       // <-- ensure Node runtime (UA allowed)
export const revalidate = 0;
export const dynamic = "force-dynamic";

type Headline = { title: string; link: string; pubDate?: string; source: string };

// 1) Primary, robust RSS feed (GovDelivery for BLS)
const RSS_PRIMARY = "https://content.govdelivery.com/accounts/USDOLBLS/bulletins.rss";

// 2) HTML fallbacks on bls.gov
const HTML_CANDIDATES = [
  "https://www.bls.gov/bls/newsrels.htm",
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
        "Accept": "application/rss+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
      },
    });
    if (!r.ok) throw new Error(`Fetch ${url} -> ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(to);
  }
}

/* ---------- parsers ---------- */

function parseRss(xml: string): Headline[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const out: Headline[] = [];
  for (const it of items) {
    const title =
      it.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i)?.[1]?.trim() ??
      it.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ??
      "";
    const link =
      it.match(/<link>([^<]+)<\/link>/i)?.[1]?.trim() ??
      it.match(/<guid[^>]*>([^<]+)<\/guid>/i)?.[1]?.trim() ??
      "";
    const pubDate = it.match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1]?.trim() ?? "";
    if (title && link) out.push({ title, link, pubDate, source: "rss" });
  }
  return out;
}

function parseHtmlForReleases(html: string, pageUrl: string): Headline[] {
  const anchors =
    html.match(
      /<a[^>]+href="(\/news\.release\/[^"#]+|https?:\/\/www\.bls\.gov\/news\.release\/[^"#]+)"[^>]*>[\s\S]*?<\/a>/gi
    ) || [];
  const seen = new Set<string>();
  const out: Headline[] = [];
  for (const a of anchors) {
    const href = a.match(/href="([^"]+)"/i)?.[1] || a.match(/HREF="([^"]+)"/)?.[1];
    if (!href) continue;
    const title = a.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!title) continue;
    const link = href.startsWith("http") ? href : `https://www.bls.gov${href}`;
    const key = `${title}::${link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, link, source: pageUrl });
  }
  return out;
}

/* ---------- handler ---------- */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "40") || 40));
  const debug = searchParams.get("debug") === "1";

  try {
    let used = "";
    let items: Headline[] = [];

    // A) GovDelivery RSS (most reliable)
    try {
      const xml = await fetchText(RSS_PRIMARY);
      const parsed = parseRss(xml);
      if (parsed.length) {
        items = parsed;
        used = `rss:${RSS_PRIMARY}`;
      }
    } catch {
      // ignore; try fallbacks
    }

    // B) Fallback to HTML pages if RSS empty
    if (!items.length) {
      for (const u of HTML_CANDIDATES) {
        try {
          const html = await fetchText(u);
          const parsed = parseHtmlForReleases(html, u);
          if (parsed.length) {
            items = parsed;
            used = `html:${u}`;
            break;
          }
        } catch {
          // continue
        }
      }
    }

    if (!items.length) {
      return NextResponse.json(
        { error: "No headlines returned from BLS sources.", data: [] },
        { status: 502 }
      );
    }

    // Sort by pubDate when present; otherwise keep order
    items.sort((a, b) => {
      const ta = Date.parse(a.pubDate || "") || 0;
      const tb = Date.parse(b.pubDate || "") || 0;
      return tb - ta;
    });

    // Filter only if query has 2+ chars
    if (q.length >= 2) {
      items = items.filter((h) => h.title.toLowerCase().includes(q));
    }

    items = items.slice(0, limit);

    if (debug) {
      return NextResponse.json({
        used,
        count: items.length,
        sample: items.slice(0, 5),
      });
    }

    return NextResponse.json({ data: items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error", data: [] },
      { status: 500 }
    );
  }
}
