// app/api/filings/route.ts
import { NextResponse } from "next/server";

type Recent = {
  accessionNumber: string[];
  filingDate: string[];
  reportDate: string[];
  form: string[];
  primaryDocDescription: string[];
  primaryDocument: string[];
};

type HistoricFile = {
  name: string; // e.g. "filing-details-YYYY.json"
  filingCount: number;
  filingFrom: string;
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
    files?: HistoricFile[];
  };
};

const SEC = {
  json: (cik: string) =>
    `https://data.sec.gov/submissions/CIK${cik}.json`,
  // historical per-year JSON entries are linked inside submissions.filings.files[].name
  historic: (cik: string, name: string) =>
    `https://data.sec.gov/submissions/${name.startsWith("Archives/") ? name : `CIK${cik}-${name}`}`,
};

const UA = process.env.SEC_USER_AGENT || "herevna.io contact@herevna.io";

function stripDashes(acc: string) {
  return acc.replace(/-/g, "");
}
function makeDocURL(cik: string, accession: string, primary: string) {
  // https://www.sec.gov/Archives/edgar/data/{CIK no-leading-zeros}/{accessionNoDashes}/{primaryDocument}
  const cikNum = String(parseInt(cik, 10)); // drop leading zeros for path
  const accNoDash = stripDashes(accession);
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDash}/${primary}`;
}
function makeIndexURL(cik: string, accession: string) {
  const cikNum = String(parseInt(cik, 10));
  const accNoDash = stripDashes(accession);
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDash}/${accNoDash}-index.html`;
}

function inDateRange(d: string, start?: string | null, end?: string | null) {
  if (!d) return false;
  const n = d.replace(/-/g, "");
  if (start) {
    const s = start.replace(/-/g, "");
    if (n < s) return false;
  }
  if (end) {
    const e = end.replace(/-/g, "");
    if (n > e) return false;
  }
  return true;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const cik = (url.searchParams.get("cik") || "").padStart(10, "0");
    if (!/^\d{10}$/.test(cik)) {
      return NextResponse.json({ error: "Invalid or missing CIK" }, { status: 400 });
    }

    const form = (url.searchParams.get("form") || "").trim(); // optional exact match or CSV list
    const start = url.searchParams.get("start"); // YYYY or YYYY-MM-DD
    const end = url.searchParams.get("end");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = Math.min(100, parseInt(url.searchParams.get("pageSize") || "25", 10));
    const ownerName = (url.searchParams.get("owner") || "").trim().toLowerCase();

    // load submissions JSON (contains recent + pointers to historical JSON files)
    const subRes = await fetch(SEC.json(cik), {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!subRes.ok) {
      return NextResponse.json(
        { error: `SEC submissions fetch failed (${subRes.status})` },
        { status: 502 }
      );
    }
    const subs = (await subRes.json()) as Submissions;

    // recent
    const r = subs.filings.recent;
    const recentRows =
      r.accessionNumber.map((acc, i) => ({
        accessionNumber: acc,
        filingDate: r.filingDate[i],
        reportDate: r.reportDate[i] || "",
        form: r.form[i],
        primaryDocument: r.primaryDocument[i],
        primaryDocDescription: r.primaryDocDescription[i] || "",
      })) || [];

    // historical (merge all year files if present)
    let historicRows: Array<{
      accessionNumber: string;
      filingDate: string;
      reportDate?: string;
      form: string;
      primaryDocument: string;
      primaryDocDescription?: string;
    }> = [];

    if (subs.filings.files && subs.filings.files.length) {
      // fetch each referenced JSON
      const tasks = subs.filings.files.map(async (f) => {
        // BEWARE: SEC can return either absolute path or the name to be appended
        const urlGuess = f.name.startsWith("edgar/data")
          ? `https://www.sec.gov/Archives/${f.name}`
          : `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${f.name}`;
        // A safer fallback is the alternative “submissions/<name>” pattern:
        const tries = [urlGuess, SEC.historic(cik, f.name)];

        for (const u of tries) {
          try {
            const res = await fetch(u, {
              headers: { "User-Agent": UA, Accept: "application/json" },
              cache: "no-store",
            });
            if (!res.ok) continue;
            const j = (await res.json()) as HistoricPayload;
            return j.filings.files;
          } catch {
            // keep trying next
          }
        }
        return [];
      });

      const lists = await Promise.all(tasks);
      for (const list of lists) {
        if (Array.isArray(list)) {
          historicRows.push(...list);
        }
      }
    }

    // combine, filter, sort desc by date
    let rows = [...recentRows, ...historicRows];

    if (form) {
      const forms = form
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      rows = rows.filter((x) => forms.includes(x.form.toUpperCase()));
    }
    if (start || end) {
      rows = rows.filter((x) => inDateRange(x.filingDate, start, end));
    }

    // If insider owner filter present (form 3/4/5), we’ll keep rows but
    // when ownerName exists we’ll *augment* each row with a lazy owner hit flag
    // by scanning the primary document (simple fast contains check).
    // This is best-effort (for speed); it avoids an up-front crawl of every filing.
    if (ownerName) {
      const limited = rows.slice(0, 150); // cap quick scan to keep perf
      const hits: Set<string> = new Set();
      await Promise.all(
        limited.map(async (x) => {
          try {
            const url = makeDocURL(cik, x.accessionNumber, x.primaryDocument);
            const res = await fetch(url, {
              headers: { "User-Agent": UA, Accept: "text/html,application/xml" },
            });
            if (!res.ok) return;
            const text = await res.text();
            // normalize whitespace + lowercase
            const norm = text.replace(/\s+/g, " ").toLowerCase();
            if (norm.includes(ownerName)) hits.add(x.accessionNumber);
          } catch {}
        })
      );
      rows = rows.filter((x) => hits.has(x.accessionNumber));
    }

    // sort newest first
    rows.sort((a, b) => (a.filingDate < b.filingDate ? 1 : -1));

    const total = rows.length;
    const from = (page - 1) * pageSize;
    const to = Math.min(from + pageSize, total);
    const pageRows = rows.slice(from, to).map((x) => {
      const viewUrl = makeIndexURL(cik, x.accessionNumber);
      const docUrl = makeDocURL(cik, x.accessionNumber, x.primaryDocument);
      return {
        form: x.form,
        filingDate: x.filingDate,
        reportDate: x.reportDate || "",
        accessionNumber: x.accessionNumber,
        primaryDocument: x.primaryDocument,
        title: x.primaryDocDescription || "",
        links: {
          view: viewUrl, // SEC index page
          download: docUrl, // direct primary document
        },
      };
    });

    return NextResponse.json({
      meta: {
        cik,
        name: subs.name,
        total,
        page,
        pageSize,
      },
      data: pageRows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Filings fetch failed" }, { status: 500 });
  }
}