// app/api/insiders/[cik]/route.ts
import { NextResponse } from "next/server";

const DEFAULT_UA = "Herevna/1.0 (your-email@example.com)";
const SEC_UA = process.env.SEC_USER_AGENT || DEFAULT_UA;
const SEC_JSON_HEADERS = { "User-Agent": SEC_UA, "Accept": "application/json" };
const SEC_TEXT_HEADERS = { "User-Agent": SEC_UA, "Accept": "text/html, text/plain" };

function zeroPadCIK(cik: string) {
  return cik.replace(/\D/g, "").padStart(10, "0");
}
function isDocLike(url: string) {
  const u = url.toLowerCase();
  return u.endsWith(".xml") || u.endsWith(".htm") || u.endsWith(".html") || u.endsWith(".txt");
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stripTags(s: string) {
  return s.replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
}

function extractOwnerNames(text: string): string[] {
  const out = new Set<string>();
  // XML forms commonly have this:
  const xml = /<rptownername>\s*([^<]+?)\s*<\/rptownername>/gi;
  let m: RegExpExecArray | null;
  while ((m = xml.exec(text)) !== null) out.add(m[1].trim());

  // HTML variants:
  const htmlBlock = /name and address of reporting person(?:s)?:?\s*([a-z0-9 ,.'-]+)/gi;
  while ((m = htmlBlock.exec(text)) !== null) out.add(m[1].trim());

  // Sometimes there are table rows like: Reporting Owner: John Q Doe
  const simple = /reporting (?:owner|person)\s*[:\-]\s*([a-z0-9 ,.'-]+)/gi;
  while ((m = simple.exec(stripTags(text).toLowerCase())) !== null) {
    out.add(m[1].trim().replace(/\s+/g, " "));
  }

  return Array.from(out).filter(n => n.length > 2);
}

export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const cik10 = zeroPadCIK(params.cik);
    const q = (searchParams.get("q") || "").toLowerCase();
    const limit = Math.min(200, Math.max(20, parseInt(searchParams.get("limit") || "120"))); // scan up to N recent

    // get recent filings list
    const subsURL = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    const subs = await fetch(subsURL, { headers: SEC_JSON_HEADERS, cache: "no-store" });
    if (!subs.ok) return NextResponse.json({ error: `SEC fetch failed (${subs.status})` }, { status: 502 });
    const data = await subs.json();
    const recent = data?.filings?.recent || {};
    const N = (recent?.accessionNumber || []).length;

    // keep only 3/4/5, newest first
    const rows: Array<{ acc: string; primary: string | null }> = [];
    for (let i = 0; i < N; i++) {
      const form = String(recent.form[i] || "").toUpperCase();
      if (!/^3|^4|^5/.test(form)) continue;
      rows.push({
        acc: String(recent.accessionNumber[i] || "").replace(/-/g, ""),
        primary: recent.primaryDocument?.[i] ? String(recent.primaryDocument[i]) : null,
      });
    }
    rows.reverse(); // oldest→newest; we want newest first:
    rows.reverse();

    const names = new Set<string>();
    for (const r of rows.slice(0, limit)) {
      const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik10, 10)}/${r.acc}`;
      const primaryUrl = r.primary ? `${base}/${r.primary}` : `${base}/index.html`;
      const tryUrls = [
        primaryUrl,
        `${base}/${r.acc}.xml`,
        `${base}/${r.acc}.txt`,
      ];
      let grabbed = false;
      for (const u of tryUrls) {
        try {
          if (!isDocLike(u)) continue;
          const rr = await fetch(u, { headers: SEC_TEXT_HEADERS, cache: "no-store" });
          if (!rr.ok) continue;
          const raw = await rr.text();
          for (const n of extractOwnerNames(raw)) names.add(n);
          grabbed = true;
          break;
        } catch { /* ignore */ }
        await sleep(100);
      }
      if (!grabbed) await sleep(60);
      if (names.size > 2000) break; // safety
    }

    let out = Array.from(names);
    if (q) out = out.filter(n => n.toLowerCase().includes(q));

    // sort by simple heuristic: shorter names first, then alpha
    out.sort((a, b) => a.length - b.length || a.localeCompare(b));

    return NextResponse.json({ cik: cik10, count: out.length, data: out.slice(0, 50) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}