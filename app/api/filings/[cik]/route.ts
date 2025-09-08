// app/api/filings/[cik]/route.ts
import { NextResponse } from "next/server";

// ----- SEC fetch config -----
const DEFAULT_UA = "Herevna/1.0 (your-email@example.com)";
const SEC_UA = process.env.SEC_USER_AGENT || DEFAULT_UA;
const SEC_JSON_HEADERS = {
  "User-Agent": SEC_UA,
  "Accept": "application/json",
};
const SEC_TEXT_HEADERS = {
  "User-Agent": SEC_UA,
  "Accept": "text/html, text/plain",
};

function zeroPadCIK(cik: string) {
  return cik.replace(/\D/g, "").padStart(10, "0");
}
function isDocLike(url: string) {
  const u = url.toLowerCase();
  return u.endsWith(".htm") || u.endsWith(".html") || u.endsWith(".txt") || u.endsWith(".xml");
}
function stripTags(htmlOrText: string) {
  return htmlOrText.replace(/<style[\s\S]*?<\/style>/gi, " ")
                   .replace(/<script[\s\S]*?<\/script>/gi, " ")
                   .replace(/<[^>]+>/g, " ")
                   .replace(/\s+/g, " ")
                   .trim();
}

// ---------- SMART NAME MATCH ----------
type NameParts = { first?: string; last?: string; middle?: string; tokens: string[] };

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function splitName(s: string): NameParts {
  const t = norm(s).split(" ").filter(Boolean);
  if (t.length === 0) return { tokens: [] };
  if (t.length === 1) return { last: t[0], tokens: t };
  // heuristic: last token is last name
  const last = t[t.length - 1];
  const first = t[0];
  const middle = t.slice(1, -1).join(" ");
  return { first, middle, last, tokens: t };
}
function initialOf(s?: string) { return s && s[0] ? s[0] : ""; }

function smartMatch(candidateText: string, queryName: string) {
  // Returns true if queryName plausibly appears in candidateText
  const hay = norm(candidateText);
  const q = splitName(queryName);
  if (!q.tokens.length) return false;

  // 1) direct substring
  if (hay.includes(q.tokens.join(" "))) return true;

  // 2) reversed order: "last first"
  if (q.first && q.last) {
    const rev = `${q.last} ${q.first}`;
    if (hay.includes(rev)) return true;
  }

  // 3) last + first-initial
  if (q.last && q.first) {
    const lf = `${q.last} ${initialOf(q.first)}`;
    if (hay.includes(lf)) return true;
    const fl = `${q.first} ${q.last}`;
    if (hay.includes(fl)) return true;
  }

  // 4) xml tag version might have no spaces around: handle “rptonername” normalization already done by norm()
  // 5) relaxed: last name only + “reporting person/owner” proximity
  if (q.last && hay.includes(q.last)) {
    // proximity hint
    if (/\breporting (person|owner)\b/.test(hay)) return true;
  }

  return false;
}

// Try to extract reporting owner names from XML-like Forms 3/4/5 (common tag: <rptOwnerName>John Q Doe</rptOwnerName>)
function extractOwnerNames(text: string): string[] {
  const out = new Set<string>();
  const re = /<rptownername>\s*([^<]+?)\s*<\/rptownername>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[1].trim());
  // 8-K HTML often: “Name and Address of Reporting Person”
  const block = /name and address of reporting person(?:s)?:?\s*([a-z0-9 ,.'-]+)/gi;
  while ((m = block.exec(text)) !== null) out.add(m[1].trim());
  return Array.from(out);
}

// A tiny sleep/backoff helper for rate limits
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const cikRaw = params.cik;
    const cik10 = zeroPadCIK(cikRaw);

    const q = (searchParams.get("q") || "").trim(); // insider name (optional)
    const start = searchParams.get("start") || "";   // YYYY-MM-DD optional
    const end = searchParams.get("end") || "";       // YYYY-MM-DD optional
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "10")));

    // Forms filter (comma list)
    let formsParam = (searchParams.get("forms") || "")
      .split(",")
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    // If user asks by insider name and no forms supplied, default to 3/4/5 insider forms
    const insiderMode = q.length > 0;
    if (insiderMode && formsParam.length === 0) {
      formsParam = ["3", "4", "5"];
    }

    // Fetch company submissions (recent filings list)
    const subsURL = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    const subs = await fetch(subsURL, { headers: SEC_JSON_HEADERS, cache: "no-store" });
    if (!subs.ok) {
      return NextResponse.json({ error: `SEC fetch failed (${subs.status})` }, { status: 502 });
    }
    const data = await subs.json();
    const name = data?.name || "Company";

    const recent = data?.filings?.recent || {};
    const N = (recent?.accessionNumber || []).length;

    // Gather all filings into an array of objects
    type Filing = {
      form: string;
      filed_at: string; // YYYY-MM-DD
      accession: string; // digits only
      primary: string | null;
    };
    const filings: Filing[] = [];
    for (let i = 0; i < N; i++) {
      filings.push({
        form: String(recent.form[i] || ""),
        filed_at: String(recent.filingDate[i] || ""),
        accession: String(recent.accessionNumber[i] || "").replace(/-/g, ""),
        primary: recent.primaryDocument?.[i] ? String(recent.primaryDocument[i]) : null,
      });
    }

    // Date filter
    function inRange(d: string) {
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    }

    // Form filter
    function formAllowed(f: string) {
      if (formsParam.length === 0) return true;
      const F = f.toUpperCase();
      return formsParam.some(ff => F.startsWith(ff));
    }

    // Pre-filter by date & form first
    let filtered = filings.filter(f => (!start && !end ? true : inRange(f.filed_at)) && formAllowed(f.form));

    // Insider name scan (if q provided): fetch each primary doc (or index.txt) and apply smart match
    let matched: any[] = [];
    if (insiderMode) {
      // scan a chunk limited by paging later; still need to examine many, so we start from most recent
      for (const f of filtered) {
        const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik10, 10)}/${f.accession}`;
        const primaryUrl = f.primary ? `${base}/${f.primary}` : `${base}/index.html`;

        // backstop to .txt if primary isn't HTML
        const tryUrls = [primaryUrl, `${base}/${f.accession}.txt`];
        let body = "";
        for (const u of tryUrls) {
          try {
            if (!isDocLike(u)) continue;
            const r = await fetch(u, { headers: SEC_TEXT_HEADERS, cache: "no-store" });
            if (r.ok) {
              const raw = await r.text();
              body = stripTags(raw);
              // Quick extraction of owner names (may help reduce false negatives)
              const owners = extractOwnerNames(raw);
              if (owners.some(o => smartMatch(o, q)) || smartMatch(body, q)) {
                matched.push({
                  cik: cik10,
                  company: name,
                  form: f.form,
                  filed_at: f.filed_at,
                  title: `${name} • ${f.form} • ${f.filed_at}`,
                  links: {
                    index: `${base}/index.html`,
                    primary: isDocLike(primaryUrl) ? primaryUrl : null,
                    fullText: `${base}/${f.accession}.txt`,
                  },
                });
                break; // no need to try second URL if already matched
              }
            }
          } catch {
            // be tolerant and just continue
          }
          // tiny politeness delay
          await sleep(120);
        }
      }
    } else {
      // No insider name → we can skip fetching bodies; just prepare rows
      matched = filtered.map(f => {
        const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik10, 10)}/${f.accession}`;
        const primaryUrl = f.primary ? `${base}/${f.primary}` : `${base}/index.html`;
        return {
          cik: cik10,
          company: name,
          form: f.form,
          filed_at: f.filed_at,
          title: `${name} • ${f.form} • ${f.filed_at}`,
          links: {
            index: `${base}/index.html`,
            primary: isDocLike(primaryUrl) ? primaryUrl : null,
            fullText: `${base}/${f.accession}.txt`,
          },
        };
      });
    }

    // Sort newest → oldest
    matched.sort((a, b) => (a.filed_at < b.filed_at ? 1 : a.filed_at > b.filed_at ? -1 : 0));

    // Paging
    const total = matched.length;
    const startIdx = (page - 1) * pageSize;
    const pageItems = matched.slice(startIdx, startIdx + pageSize);

    return NextResponse.json({
      company: name,
      cik: cik10,
      total,
      page,
      pageSize,
      data: pageItems,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}