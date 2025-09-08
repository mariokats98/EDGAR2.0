// app/api/bls/releases/route.ts
import { NextResponse } from "next/server";

export const revalidate = 0;
export const dynamic = "force-dynamic";

const RSS_FEEDS = [
  "https://www.bls.gov/feed/news_release.rss",
  "https://www.bls.gov/feed/bls_latest.rss",
];
const NEWS_FALLBACK = "https://www.bls.gov/bls/newsrels.htm";

function UA() {
  return (
    process.env.BLS_USER_AGENT ||
    // Realistic desktop UA improves acceptance on some hosts
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 HerevnaBot/1.0 (contact@herevna.io)"
  );
}

async function fetchText(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA(),
        "Accept":
          "application/rss+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
      },
    });
    if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

// --- parsers -------------------------------------------------------

type Headline = { title: string; link: string; pubDate?: string; source: string };

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

function parseNewsPage(html: string): Headline[] {
  // The page lists <a href="/news.release/xxx.htm">Headline</a> …
  const anchors = html.match(/<a\s+href="\/news\.release\/[^"]+"\s*>[\s\S]*?<\/a>/gi) || [];
  const seen = new Set<string>();
  const out: Headline[] = [];
  for (const a of anchors) {
    const href = a.match(/href="([^"]+)"/i)?.[1];
    let title =
      a.match(/<!\[CDATA\[(.*?)\]\]>/i)?.[1]?.trim() ??
      a.replace(/<[^>]+>/g, "").trim();
    if (!href || !title) continue;
    const link = href.startsWith("http") ? href : `https://www.bls.gov${href}`;
    const key = `${title}::${link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, link, source: "html" });
  }
  return out;
}

// --- main handler --------------------------------------------------

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "40") || 40));
  const debug = searchParams.get("debug") === "1";

  try {
    // 1) Try RSS feeds (with retry chain)
    let items: Headline[] = [];
    let feedUsed = "";
    for (const url of RSS_FEEDS) {
      try {
        const xml = await fetchText(url);
        const parsed = parseRss(xml);
        if (parsed.length) {
          items = parsed;
          feedUsed = url;
          break;
        }
      } catch {
        // continue to next
      }
    }

    // 2) Fallback: scrape BLS news page if RSS empty
    let fallbackUsed = false;
    if (!items.length) {
      try {
        const html = await fetchText(NEWS_FALLBACK);
        const parsed = parseNewsPage(html);
        if (parsed.length) {
          items = parsed;
          fallbackUsed = true;
        }
      } catch {
        // ignore; handled below if still empty
      }
    }

    // nothing at all?
    if (!items.length) {
      return NextResponse.json(
        { error: "No headlines returned from BLS (RSS and fallback empty).", data: [] },
        { status: 502 }
      );
    }

    // filter (only if query ≥ 2 chars)
    if (q.length >= 2) {
      items = items.filter((h) => h.title.toLowerCase().includes(q));
    }

    // sort by pubDate (when present), else keep order
    items.sort((a, b) => {
      const ta = Date.parse(a.pubDate || "") || 0;
      const tb = Date.parse(b.pubDate || "") || 0;
      return tb - ta;
    });

    items = items.slice(0, limit);

    if (debug) {
      return NextResponse.json({
        used: fallbackUsed ? "html-fallback" : "rss",
        feedUsed,
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
