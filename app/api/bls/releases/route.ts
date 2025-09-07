import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Real-time BLS releases:
 *   GET /api/bls/releases
 *   GET /api/bls/releases?withLatest=1
 *
 * Reads BLS release calendar from an ICS URL (env: BLS_CALENDAR_ICS_URL), parses upcoming
 * CPI + Employment Situation, and returns next_release dates plus (optionally) the latest values.
 */

type ReleaseItem = {
  code: "CPI" | "PAYROLLS" | "UNRATE";
  name: string;
  series: string;
  typical_time_et: string;   // Most BLS macro releases at 08:30 ET
  next_release: string | null; // YYYY-MM-DD
  latest?: { date: string; value: number } | null;
};

const BLS_API = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

const MAP: Record<string, { code: ReleaseItem["code"]; series: string; name: string; keywords: string[] }> = {
  CPI: {
    code: "CPI",
    series: "CUUR0000SA0",
    name: "Consumer Price Index (CPI-U, All Items, SA)",
    keywords: ["Consumer Price Index", "CPI"],
  },
  PAYROLLS: {
    code: "PAYROLLS",
    series: "CES0000000001",
    name: "Nonfarm Payrolls (Employment Situation)",
    keywords: ["Employment Situation", "Nonfarm payrolls"],
  },
  UNRATE: {
    code: "UNRATE",
    series: "LNS14000000",
    name: "Unemployment Rate (Employment Situation)",
    keywords: ["Employment Situation", "Unemployment rate"],
  },
};

/** Fetch latest observation for a series (newest only). */
async function fetchLatest(series: string, apiKey?: string) {
  const body: any = {
    seriesid: [series],
    startyear: "2024",
    endyear: new Date().getFullYear().toString(),
  };
  if (apiKey) body.registrationkey = apiKey;

  const r = await fetch(BLS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const j = await r.json();
  const arr = j?.Results?.series?.[0]?.data || [];
  if (!arr.length) return null;
  const d = arr[0]; // newest first
  const year = String(d.year);
  const period = String(d.period); // e.g., M01..M13
  const date = period.startsWith("M") ? `${year}-${period.slice(1)}-01` : `${year}-07-01`;
  return { date, value: Number(d.value) };
}

/** Tiny .ics parser for DTSTART + SUMMARY from VEVENT blocks. */
function parseICS(text: string): { summary: string; date: string }[] {
  const events: { summary: string; date: string }[] = [];
  const blocks = text.split(/BEGIN:VEVENT/).slice(1);
  for (const raw of blocks) {
    const body = raw.split(/END:VEVENT/)[0] || "";
    const sum = /SUMMARY:(.+)/.exec(body)?.[1]?.trim() || "";
    // DTSTART;VALUE=DATE:20250110  or  DTSTART:20250110T133000Z
    const dt = /DTSTART[^:]*:(\d{8})/.exec(body)?.[1] || null;
    if (!sum || !dt) continue;
    const yyyy = dt.slice(0, 4);
    const mm = dt.slice(4, 6);
    const dd = dt.slice(6, 8);
    events.push({ summary: sum, date: `${yyyy}-${mm}-${dd}` });
  }
  return events;
}

/** Try to find next date in ICS for a topic based on keyword matches. */
function nextDateFor(summaryList: { summary: string; date: string }[], keywords: string[]): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const hits = summaryList.filter(e =>
    keywords.some(k => e.summary.toLowerCase().includes(k.toLowerCase()))
  );
  hits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const h of hits) {
    if (h.date >= today) return h.date;
  }
  return null;
}

async function fetchCalendarNextDates(): Promise<Record<string, string | null>> {
  const icsUrl = process.env.BLS_CALENDAR_ICS_URL || "";
  if (!icsUrl) {
    // No ICS configured → return nulls (still usable, you’ll still get "latest" if requested).
    return { CPI: null, PAYROLLS: null, UNRATE: null };
  }
  const r = await fetch(icsUrl, { cache: "no-store" });
  if (!r.ok) {
    return { CPI: null, PAYROLLS: null, UNRATE: null };
  }
  const text = await r.text();
  const events = parseICS(text);
  return {
    CPI: nextDateFor(events, MAP.CPI.keywords),
    PAYROLLS: nextDateFor(events, MAP.PAYROLLS.keywords),
    UNRATE: nextDateFor(events, MAP.UNRATE.keywords),
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url, "http://local");
    const withLatest = (url.searchParams.get("withLatest") || "0") === "1";
    const apiKey = process.env.BLS_API_KEY;

    // 1) Get next release dates from ICS (or nulls if not configured)
    const nextDates = await fetchCalendarNextDates();

    // 2) Build base rows
    const base: ReleaseItem[] = [
      {
        code: "CPI",
        name: MAP.CPI.name,
        series: MAP.CPI.series,
        typical_time_et: "08:30",
        next_release: nextDates.CPI,
      },
      {
        code: "PAYROLLS",
        name: MAP.PAYROLLS.name,
        series: MAP.PAYROLLS.series,
        typical_time_et: "08:30",
        next_release: nextDates.PAYROLLS,
      },
      {
        code: "UNRATE",
        name: MAP.UNRATE.name,
        series: MAP.UNRATE.series,
        typical_time_et: "08:30",
        next_release: nextDates.UNRATE,
      },
    ];

    // 3) Optionally attach latest values (parallel)
    if (withLatest) {
      const filled = await Promise.all(
        base.map(async (row) => {
          let latest: { date: string; value: number } | null = null;
          try {
            latest = await fetchLatest(row.series, apiKey);
          } catch {}
          return { ...row, latest };
        })
      );
      return NextResponse.json({ data: filled }, { status: 200 });
    }

    return NextResponse.json({ data: base }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
