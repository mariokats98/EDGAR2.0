// app/api/bls/releases/route.ts
import { NextResponse } from "next/server";

/**
 * We read BLS "Economic News Releases" RSS.
 * Primary: https://www.bls.gov/feed/news_release.rss
 * Fallback: https://www.bls.gov/feed/bls_latest.rss
 *
 * Query params:
 *   q: optional search (case-insensitive) over title
 *   limit: optional integer (default 30)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "30", 10) || 30));

  // Fetch helpers
  async function fetchRss(url: string) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`BLS RSS fetch failed (${r.status})`);
    return r.text();
  }

  // Parse a minimal RSS (no extra deps)
  function parseItems(xml: string) {
    const items: Array<{ title: string; link: string; pubDate: string; categories: string[] }> = [];
    const blocks = xml.split(/<item>/i).slice(1); // everything after first <item>
    for (const block of blocks) {
      const chunk = block.split(/<\/item>/i)[0] || "";
      const title = (chunk.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i)?.[1] ??
                     chunk.match(/<title>([^<]+)<\/title>/i)?.[1] ??
                     "").trim();
      const link  = (chunk.match(/<link>([^<]+)<\/link>/i)?.[1] ?? "").trim();
      const pub   = (chunk.match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1] ?? "").trim();

      const cats: string[] = [];
      const catMatches = chunk.match(/<category>(.*?)<\/category>/gi) || [];
      for (const m of catMatches) {
        const v = m.replace(/<\/?category>/gi, "").trim();
        if (v) cats.push(v);
      }

      if (title && link) items.push({ title, link, pubDate: pub, categories: cats });
    }
    return items;
  }

  try {
    let xml: string;
    try {
      xml = await fetchRss("https://www.bls.gov/feed/news_release.rss");
    } catch {
      // fallback feed
      xml = await fetchRss("https://www.bls.gov/feed/bls_latest.rss");
    }
    let items = parseItems(xml);

    // filter by q (title contains)
    if (q) {
      const needle = q.toLowerCase();
      items = items.filter((it) => it.title.toLowerCase().includes(needle));
    }

    // sort desc by pubDate if present
    items.sort((a, b) => {
      const ta = Date.parse(a.pubDate || "") || 0;
      const tb = Date.parse(b.pubDate || "") || 0;
      return tb - ta;
    });

    // cap
    items = items.slice(0, limit);

    return NextResponse.json({ data: items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unable to load BLS headlines", data: [] },
      { status: 502 }
    );
  }
}
