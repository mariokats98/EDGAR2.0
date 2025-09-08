// app/api/bls/releases/route.ts
import { NextResponse } from "next/server";

export const revalidate = 0;           // no ISR — always fresh
export const dynamic = "force-dynamic";

const FEEDS = [
  "https://www.bls.gov/feed/news_release.rss",
  "https://www.bls.gov/feed/bls_latest.rss",
];

function ua() {
  // You can set BLS_USER_AGENT in Vercel → Environment Variables for your email/domain
  return process.env.BLS_USER_AGENT || "HerevnaBot/1.0 (contact@herevna.io)";
}

async function fetchText(url: string) {
  const r = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": ua(),
      "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
  });
  if (!r.ok) throw new Error(`Fetch ${url} failed (${r.status})`);
  return r.text();
}

// Very forgiving RSS parser (no extra deps)
function parseRss(xml: string) {
  const out: Array<{
    title: string;
    link: string;
    pubDate: string;
    categories: string[];
  }> = [];

  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const raw of items) {
    const text = raw;

    const title =
      text.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i)?.[1]?.trim() ??
      text.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ??
      "";

    const link =
      text.match(/<link>([^<]+)<\/link>/i)?.[1]?.trim() ??
      text.match(/<guid[^>]*>([^<]+)<\/guid>/i)?.[1]?.trim() ??
      "";

    const pubDate = text.match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1]?.trim() ?? "";

    const categories: string[] = [];
    const catMatches = text.match(/<category>([\s\S]*?)<\/category>/gi) || [];
    for (const m of catMatches) {
      const v = m.replace(/<\/?category>/gi, "").replace("<![CDATA[", "").replace("]]>", "").trim();
      if (v) categories.push(v);
    }

    if (title && link) out.push({ title, link, pubDate, categories });
  }

  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "30", 10) || 30));
  const debug = searchParams.get("debug") === "1";

  try {
    let xml = "";
    let used = "";
    let lastErr: unknown = null;

    for (const url of FEEDS) {
      try {
        xml = await fetchText(url);
        used = url;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!xml) throw lastErr || new Error("All BLS feeds failed");

    let items = parseRss(xml);

    // filter by query (title contains), but only if q has 2+ chars
    if (q.length >= 2) {
      const needle = q.toLowerCase();
      items = items.filter((it) => it.title.toLowerCase().includes(needle));
    }

    // sort desc by date (unknown dates go last)
    items.sort((a, b) => {
      const ta = Date.parse(a.pubDate || "") || 0;
      const tb = Date.parse(b.pubDate || "") || 0;
      return tb - ta;
    });

    items = items.slice(0, limit);

    if (debug) {
      return NextResponse.json({
        feedUsed: used,
        count: items.length,
        sample: items.slice(0, 3),
      });
    }

    return NextResponse.json({ data: items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to load BLS headlines", data: [] },
      { status: 502 }
    );
  }
}
