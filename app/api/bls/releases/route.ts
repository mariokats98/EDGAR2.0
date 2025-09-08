// app/api/bls/releases/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Headline = { title: string; link: string; pubDate?: string; source: string };

const RSS_PRIMARY = "https://content.govdelivery.com/accounts/USDOLBLS/bulletins.rss";
const HTML_CANDIDATES = [
  "https://www.bls.gov/bls/newsrels.htm",
  "https://www.bls.gov/news.release/",
];

// Same endpoints via proxy (helps if direct fetch is blocked)
const RSS_PROXY = "https://r.jina.ai/http://content.govdelivery.com/accounts/USDOLBLS/bulletins.rss";
const HTML_PROXY = [
  "https://r.jina.ai/http://www.bls.gov/bls/newsrels.htm",
  "https://r.jina.ai/http://www.bls.gov/news.release/",
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

function parseRss(xml: string): Headline[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const out: Headline[] = [];
  for (const it of items) {
    const title =
      it.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i)?.[1]?.trim() ??
      it.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? "";
    // Prefer <link>, fall back to <guid>
    let link =
      it.match(/<link>([^<]+)<\/link>/i)?.[1]?.trim() ??
      it.match(/<guid[^>]*>([^<]+)<\/guid>/i)?.[1]?.trim() ?? "";
    // Some feeds embed <link> content inside CDATA with tracking junk; attempt to extract a proper URL
    const mHref = link.match(/https?:\/\/[^\s<]+/i);
    if (mHref) link = mHref[0];
    const pubDate = it.match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1]?.trim() ?? "";
    if (title && link) out.push({ title, link, pubDate, source: "rss" });
  }
  return out;
}

function parseHtmlForReleases(html: string, pageUrl: string): Headline[] {
  // When proxied via r.jina.ai, content may be simplified but anchors often remain.
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

function sample(): Headline[] {
  return [
    {
      title: "The Employment Situation — August 2025",
      link: "https://www.bls.gov/news.release/empsit.nr0.htm",
      pubDate: new Date().toUTCString(),
      source: "sample",
    },
    {
      title: "Consumer Price Index — August 2025",
      link: "https://www.bls.gov/news.release/cpi.nr0.htm",
      pubDate: new Date().toUTCString(),
      source: "sample",
    },
    {
      title: "Producer Price Index — August 2025",
      link: "https://www.bls.gov/news.release/ppi.nr0.htm",
      pubDate: new Date().toUTCString(),
      source: "sample",
    },
  ];
}

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "40") || 40));
  const debug = searchParams.get("debug") === "1";
  const forceSample = searchParams.get("force") === "sample";

  try {
    if (forceSample) {
      const data = sample().slice(0, limit);
      return NextResponse.json(debug ? { used: "sample", count: data.length, sample: data } : { data });
    }

    let items: Headline[] = [];
    let used: string[] = [];

    // A) Primary RSS
    try {
      const xml = await fetchText(RSS_PRIMARY);
      const parsed = parseRss(xml);
      if (parsed.length) {
        items = parsed;
        used.push(`rss:${RSS_PRIMARY}`);
      }
    } catch { /* continue */ }

    // B) HTML pages (direct)
    if (!items.length) {
      for (const u of HTML_CANDIDATES) {
        try {
          const html = await fetchText(u);
          const parsed = parseHtmlForReleases(html, u);
          if (parsed.length) {
            items = parsed;
            used.push(`html:${u}`);
            break;
          }
        } catch { /* continue */ }
      }
    }

    // C) Proxied RSS via r.jina.ai
    if (!items.length) {
      try {
        const xml = await fetchText(RSS_PROXY);
        const parsed = parseRss(xml);
        if (parsed.length) {
          items = parsed;
          used.push(`rss-proxy:${RSS_PROXY}`);
        }
      } catch { /* continue */ }
    }

    // D) Proxied HTML via r.jina.ai
    if (!items.length) {
      for (const u of HTML_PROXY) {
        try {
          const html = await fetchText(u);
          const parsed = parseHtmlForReleases(html, u);
          if (parsed.length) {
            items = parsed;
            used.push(`html-proxy:${u}`);
            break;
          }
        } catch { /* continue */ }
      }
    }

    if (!items.length) {
      // Final sanity: return sample so UI never looks empty
      const data = sample().slice(0, limit);
      return NextResponse.json(
        debug ? { used: used.join(","), count: data.length, sample: data, note: "returned sample due to empty sources" }
              : { data, note: "sample" }
      );
    }

    // Sort by pubDate when present; otherwise keep source order
    items.sort((a, b) => {
      const ta = Date.parse(a.pubDate || "") || 0;
      const tb = Date.parse(b.pubDate || "") || 0;
      return tb - ta;
    });

    // Filter only if query has 2+ chars
    if (q.length >= 2) items = items.filter((h) => h.title.toLowerCase().includes(q));

    items = items.slice(0, limit);

    if (debug) {
      return NextResponse.json({ used: used.join(","), count: items.length, sample: items.slice(0, 5) });
    }
    return NextResponse.json({ data: items });
  } catch (e: any) {
    // As a last resort, do not error the UI—serve sample with a note
    const data = sample().slice(0, limit);
    return NextResponse.json(
      { data, note: "sample on error", error: e?.message || "Unexpected error" },
      { status: 200 }
    );
  }
}
