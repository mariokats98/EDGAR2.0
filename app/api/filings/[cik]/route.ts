// app/api/filings/[cik]/route.ts
import { NextResponse } from "next/server";

const SEC_BASE = "https://data.sec.gov";             // <-- IMPORTANT: use data.sec.gov
const SEC_ARCHIVES = "https://www.sec.gov/Archives"; // for document links

function getUA() {
  const ua = process.env.SEC_USER_AGENT || process.env.SEC_USERAGENT || "";
  // SEC requires a descriptive UA w/ contact. Provide a safe fallback.
  return ua || "herevna.io (contact@herevna.io)";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function secFetch(url: string, init?: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const r = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": getUA(),
        "Accept": "application/json,text/plain,*/*",
        ...(init?.headers || {}),
      },
      // Vercel edge sometimes benefits from no caching for SEC JSON
      cache: "no-store",
    });
    if (r.status === 429 || r.status === 403) {
      // backoff a bit then retry
      const wait = 600 * (i + 1);
      await sleep(wait);
      continue;
    }
    return r;
  }
  // final attempt
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": getUA(),
      "Accept": "application/json,text/plain,*/*",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
}

function normalizeCIK(input: string): string | null {
  if (!input) return null;
  let s = input.trim();
  if (/^CIK/i.test(s)) s = s.replace(/^CIK/i, "");
  s = s.replace(/\D/g, ""); // keep digits only
  if (!s) return null;
  if (s.length > 10) s = s.slice(-10);
  return s.padStart(10, "0");
}

type Filing = {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string;
  form: string;
  primaryDocument?: string;
  primaryDocDescription?: string;
};

function buildOpenUrl(cik10: string, acc: string, primary?: string) {
  const cikNoZeros = String(parseInt(cik10, 10)); // drop leading zeros for Archives path
  const accNoDashes = acc.replace(/-/g, "");
  // Prefer primary doc when present; otherwise open the index
  if (primary) {
    return `${SEC_ARCHIVES}/edgar/data/${cikNoZeros}/${accNoDashes}/${primary}`;
  }
  return `${SEC_ARCHIVES}/edgar/data/${cikNoZeros}/${accNoDashes}/${acc}-index.html`;
}

function inDateRange(d: string, start: string, end: string) {
  return (!start || d >= start) && (!end || d <= end);
}

export async function GET(
  req: Request,
  { params }: { params: { cik: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const start = (searchParams.get("start") || "").trim();         // YYYY-MM-DD
    const end = (searchParams.get("end") || "").trim();             // YYYY-MM-DD
    const formsRaw = (searchParams.get("forms") || "").trim();      // "10-K,10-Q,8-K"
    const perPage = Math.max(1, Math.min(200, parseInt(searchParams.get("perPage") || "50", 10)));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const freeText = (searchParams.get("q") || "").trim().toLowerCase();

    const cikOrId = params.cik || "";
    const cik10 = normalizeCIK(cikOrId);
    if (!cik10) {
      return NextResponse.json(
        { ok: false, error: "Missing identifier. Provide CIK (digits or 'CIK...')." },
        { status: 400 }
      );
    }

    // fetch submissions for the CIK from data.sec.gov
    const subUrl = `${SEC_BASE}/submissions/CIK${cik10}.json`;
    const r = await secFetch(subUrl);
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `SEC submissions fetch failed (${r.status})`, details: text.slice(0, 300) },
        { status: r.status }
      );
    }
    const j = await r.json();

    const companyName: string | undefined = j?.name || j?.entityType || undefined;
    const filings: Filing[] = Array.isArray(j?.filings?.recent?.accessionNumber)
      ? j.filings.recent.accessionNumber.map((acc: string, i: number) => ({
          accessionNumber: acc,
          filingDate: j.filings.recent.filingDate[i],
          reportDate: j.filings.recent.reportDate?.[i],
          form: j.filings.recent.form[i],
          primaryDocument: j.filings.recent.primaryDocument?.[i],
          primaryDocDescription: j.filings.recent.primaryDocDescription?.[i],
        }))
      : [];

    // Optional: include older filings too (j.filings.files is a list of paginated JSON files)
    let historic: Filing[] = [];
    if (Array.isArray(j?.filings?.files)) {
      const tasks = j.filings.files.map(async (f: any) => {
        if (!f?.name) return [];
        const fileUrl = `${SEC_ARCHIVES}/${f.name}`.replace("www.sec.gov/Archives", "data.sec.gov/Archives");
        const rr = await secFetch(fileUrl);
        if (!rr.ok) return [];
        const jj = await rr.json().catch(() => null) as any;
        if (!jj?.filings) return [];
        const arr = Array.isArray(jj.filings) ? jj.filings : [];
        return arr.map((x: any) => ({
          accessionNumber: x.accessionNumber,
          filingDate: x.filingDate,
          reportDate: x.reportDate,
          form: x.form,
          primaryDocument: x.primaryDocument,
          primaryDocDescription: x.primaryDocDescription,
        })) as Filing[];
      });
      const lists = await Promise.all(tasks);
      for (const list of lists) {
        if (Array.isArray(list)) historic.push(...list);
      }
    }

    let all: Filing[] = [...filings, ...historic];

    // Filter by date range
    if (start || end) {
      all = all.filter((f) => f.filingDate && inDateRange(f.filingDate, start, end));
    }

    // Filter by forms if provided
    const forms = formsRaw
      ? formsRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : [];
    if (forms.length > 0) {
      all = all.filter((f) => forms.includes((f.form || "").toUpperCase()));
    }

    // Free-text filter across description / form (lightweight)
    if (freeText) {
      all = all.filter((f) => {
        const hay = [
          f.form || "",
          f.primaryDocDescription || "",
          f.accessionNumber || "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(freeText);
      });
    }

    // Sort most-recent first
    all.sort((a, b) => (a.filingDate < b.filingDate ? 1 : a.filingDate > b.filingDate ? -1 : 0));

    const total = all.length;
    const startIdx = (page - 1) * perPage;
    const slice = all.slice(startIdx, startIdx + perPage);

    const rows = slice.map((f) => ({
      cik: cik10,
      company: companyName,
      form: f.form,
      filed: f.filingDate,
      accessionNumber: f.accessionNumber,
      open: buildOpenUrl(cik10, f.accessionNumber, f.primaryDocument),
    }));

    return NextResponse.json({
      ok: true,
      total,
      count: rows.length,
      data: rows,
      query: {
        id: cikOrId,
        resolvedCIK: cik10,
        start,
        end,
        forms,
        perPage,
        page,
        freeText,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}