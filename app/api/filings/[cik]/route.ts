// app/api/filings/route.ts
import { NextResponse } from "next/server";

type Recent = {
  accessionNumber: string[];
  filingDate: string[];
  reportDate: string[];
  form: string[];
  primaryDocument: string[];
  primaryDocDescription: string[];
};

type HistoricFileEntry = {
  name: string;          // e.g., "CIK0000320193-2015.json" (SEC pattern)
  filingCount: number;
  filingFrom: string;    // e.g., "2015-01-01"
  filingTo: string;
};

type HistoricPayload = {
  filings: {
    files: Array<{
      accessionNumber: string;
      filingDate: string;
      reportDate?: string;
      form: string;
      primaryDocument: string;
      primaryDocDescription?: string;
    }>;
  };
};

type Submissions = {
  cik: string;
  name: string;
  tickers?: string[];
  filings: {
    recent: Recent;
    files?: HistoricFileEntry[];
  };
};

const UA = process.env.SEC_USER_AGENT || "herevna.io contact@herevna.io";

function padCIK(cik: string) {
  return (cik || "").replace(/\D/g, "").padStart(10, "0");
}
function cikNoLeadingZeros(cik10: string) {
  return String(parseInt(cik10, 10));
}
function stripDashes(s: string) {
  return (s || "").replace(/-/g, "");
}
function makeIndexURL(cik10: string, accession: string) {
  const cikNum = cikNoLeadingZeros(cik10);
  const acc = stripDashes(accession);
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${acc}-index.html`;
}
function makeDocURL(cik10: string, accession: string, primary: string) {
  const cikNum = cikNoLeadingZeros(cik10);
  const acc = stripDashes(accession);
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${primary}`;
}

// Accepts YYYY / YYYY-MM / YYYY-MM-DD and converts to YYYYMMDD
function normalizeDateKey(s?: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  // YYYY
  if (/^\d{4}$/.test(t)) return `${t}0101`;
  // YYYY-MM
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(t)) return `${t}-01`.replace(/-/g, "");
  // YYYY-MM-DD
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(t)) return t.replace(/-/g, "");
  // Anything else: reject safely
  return null;
}

function inRange(filingDateISO: string, startKey?: string | null, endKey?: string | null): boolean {
  if (!filingDateISO) return false;
  const n = filingDateISO.replace(/-/g, "");
  if (startKey && n < startKey) return false;
  if (endKey && n > endKey) return false;
  return true;
}

// Build SEC endpoints
const SEC = {
  submissions: (cik10: string) => `https://data.sec.gov/submissions/CIK${cik10}.json`,
  historicByName: (name: string) => `https://data.sec.gov/submissions/${name}`, // name should start with "CIK"
};

export async function GET(req: Request) {
  try {
    // ------------------ read & validate query ------------------
    const url = new URL(req.url);
    const cik10 = padCIK(url.searchParams.get("cik") || "");
    if (!/^\d{10}$/.test(cik10)) {
      return NextResponse.json({ error: "Invalid or missing CIK" }, { status: 400 });
    }

    const formsCSV = (url.searchParams.get("form") || "").trim();
    const formsFilter = formsCSV
      ? formsCSV.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : null;

    const startKey = normalizeDateKey(url.searchParams.get("start"));
    const endKey = normalizeDateKey(url.searchParams.get("end"));

    const ownerName = (url.searchParams.get("owner") || "").trim().toLowerCase();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "25", 10)));

    // ------------------ load submissions root ------------------
    const rSub = await fetch(SEC.submissions(cik10), {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!rSub.ok) {
      return NextResponse.json(
        { error: `SEC submissions fetch failed (${rSub.status})` },
        { status: 502 }
      );
    }
    const subs = (await rSub.json()) as Submissions;

    // ------------------ map "recent" rows ------------------
    const rec = subs.filings.recent || ({} as Recent);
    const recentRows =
      (rec.accessionNumber || []).map((acc, i) => ({
        accessionNumber: acc,
        filingDate: rec.filingDate?.[i] || "",
        reportDate: rec.reportDate?.[i] || "",
        form: rec.form?.[i] || "",
        primaryDocument: rec.primaryDocument?.[i] || "",
        primaryDocDescription: rec.primaryDocDescription?.[i] || "",
      })) || [];

    // ------------------ fetch & merge “historic” rows ------------------
    let historicRows:
      | Array<{
          accessionNumber: string;
          filingDate: string;
          reportDate?: string;
          form: string;
          primaryDocument: string;
          primaryDocDescription?: string;
        }>
      | [] = [];

    const files = subs.filings.files || [];
    if (files.length) {
      const tasks = files.map(async (f) => {
        const name = (f.name || "").trim();
        if (!name) return [] as HistoricPayload["filings"]["files"];

        // Correct pattern: when name starts with "CIK", call /submissions/${name}
        // Example name: "CIK0000320193-2015.json"
        const url = name.startsWith("CIK") ? SEC.historicByName(name) : SEC.historicByName(`CIK${cik10}-${name}`);

        try {
          const res = await fetch(url, {
            headers: { "User-Agent": UA, Accept: "application/json" },
            cache: "no-store",
          });
          if (!res.ok) return [];
          const j = (await res.json()) as HistoricPayload;
          return Array.isArray(j?.filings?.files) ? j.filings.files : [];
        } catch {
          return [];
        }
      });

      const lists = await Promise.all(tasks);
      for (const list of lists) {
        if (Array.isArray(list)) historicRows.push(...list);
      }
    }

    // ------------------ combine, filter, sort ------------------
    let all = [...recentRows, ...historicRows];

    if (formsFilter && formsFilter.length) {
      const set = new Set(formsFilter);
      all = all.filter((x) => set.has((x.form || "").toUpperCase()));
    }
    if (startKey || endKey) {
      all = all.filter((x) => inRange(x.filingDate, startKey, endKey));
    }

    // Optional owner (insider) filter: quick scan only on 3/4/5
    if (ownerName) {
      const formsLikely = new Set(["3", "4", "5"]);
      const candidates = all.filter((x) => formsLikely.has((x.form || "").toUpperCase())).slice(0, 150);

      const hits = new Set<string>();
      await Promise.all(
        candidates.map(async (x) => {
          const url = makeDocURL(cik10, x.accessionNumber, x.primaryDocument);
          try {
            const res = await fetch(url, {
              headers: { "User-Agent": UA, Accept: "text/html,application/xml" },
            });
            if (!res.ok) return;
            const text = await res.text();
            const norm = text.replace(/\s+/g, " ").toLowerCase();
            if (norm.includes(ownerName)) hits.add(x.accessionNumber);
          } catch {}
        })
      );
      all = all.filter((x) => hits.has(x.accessionNumber));
    }

    // newest first
    all.sort((a, b) => (a.filingDate < b.filingDate ? 1 : -1));

    const total = all.length;
    const from = (page - 1) * pageSize;
    const to = Math.min(from + pageSize, total);

    const data = all.slice(from, to).map((x) => ({
      form: x.form,
      filingDate: x.filingDate,
      reportDate: x.reportDate || "",
      accessionNumber: x.accessionNumber,
      primaryDocument: x.primaryDocument,
      title: x.primaryDocDescription || "",
      links: {
        view: makeIndexURL(cik10, x.accessionNumber),
        download: makeDocURL(cik10, x.accessionNumber, x.primaryDocument),
      },
    }));

    return NextResponse.json({
      meta: {
        cik: cik10,
        name: subs.name,
        total,
        page,
        pageSize,
      },
      data,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Filings fetch failed" }, { status: 500 });
  }
}