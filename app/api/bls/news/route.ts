// app/api/bls/news/route.ts
import { NextResponse } from "next/server";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  category?: string;
};

const CANDIDATE_FEEDS = [
  "https://www.bls.gov/feeds/news_release.rss", // primary
  "https://www.bls.gov/feed/bls_latest.rss",    // fallback
];

function parseRSS(xml: string): NewsItem[] {
  // super-light RSS item parser
  const items: NewsItem[] = [];
  const itemBlocks = xml.split(/<item>/i).slice(1);
  for (const block of itemBlocks) {
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i)?.[1]
      || block.match(/<title>(.*?)<\/title>/i)?.[1]
      || "")
      .trim();
    const link = (block.match(/<link>(.*?)<\/link>/i)?.[1] || "").trim();
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1] || "").trim();
    const category =
      (block.match(/<category><!\[CDATA\[(.*?)\]\]><\/category>/i)?.[1] ||
        block.match(/<category>(.*?)<\/category>/i)?.[1] ||
        "")
        .trim();

    if (title && link) items.push({ title, link, pubDate, category });
  }
  return items;
}

export const revalidate = 300; // cache ~5 min at the edge

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(50, parseInt(searchParams.get("limit") || "20", 10)));

  try {
    let xml = "";
    for (const url of CANDIDATE_FEEDS) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) {
          xml = await r.text();
          if (xml && xml.includes("<rss")) break;
        }
      } catch {
        // try next
      }
    }

    if (!xml) {
      return NextResponse.json({ ok: false, error: "Failed to fetch BLS RSS" }, { status: 502 });
    }

    const items = parseRSS(xml)
      .sort((a, b) => (new Date(b.pubDate).getTime() || 0) - (new Date(a.pubDate).getTime() || 0))
      .slice(0, limit);

    return NextResponse.json(
      { ok: true, items },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

