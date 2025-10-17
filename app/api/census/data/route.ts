// app/api/census/data/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/census/data?name=GDP&start=YYYY-MM-DD&end=YYYY-MM-DD&limit=1000
 * Calls FMP directly and returns normalized rows: { date, value, name, unit }
 * Robust to FMP returning plain-text errors (e.g., "Invalid name") with 200 status.
 */

// Basic synonym map to help users who type casual names
const NAME_SYNONYMS: Record<string, string> = {
  "gdp": "GDP",
  "real gdp": "GDP",
  "cpi": "CPI",
  "inflation": "CPI",
  "unemployment": "Unemployment Rate",
  "unemployment rate": "Unemployment Rate",
  "u-rate": "Unemployment Rate",
  "population": "Population",
  "ppi": "PPI",
  "producer price index": "PPI",
  "retail sales": "Retail Sales",
  "industrial production": "Industrial Production",
  "consumer confidence": "Consumer Confidence",
};

function canonicalizeName(input: string) {
  const key = input.trim().toLowerCase();
  return NAME_SYNONYMS[key] ?? input.trim();
}

// inclusive date-range check
function inRange(d: string | null, start?: string | null, end?: string | null) {
  if (!d) return false;
  const t = Date.parse(d);
  if (Number.isNaN(t)) return false;
  if (start) {
    const s = Date.parse(start);
    if (!Number.isNaN(s) && t < s) return false;
  }
  if (end) {
    const e = new Date(end);
    const ePlus = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1).getTime();
    if (t >= ePlus) return false;
  }
  return true;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawName = (searchParams.get("name") || "").trim();
    const name = canonicalizeName(rawName);
    const start = searchParams.get("start"); // YYYY-MM-DD
    const end = searchParams.get("end");     // YYYY-MM-DD
    const limit = Math.max(1, Math.min(5000, Number(searchParams.get("limit") || 1000)));

    if (!name) {
      return NextResponse.json({ data: [], error: "Missing indicator name" }, { status: 400 });
    }

    const key = process.env.FMP_API_KEY;
    if (!key) {
      return NextResponse.json({ data: [], error: "Missing FMP_API_KEY" }, { status: 500 });
    }

    // Direct FMP call (no proxy)
    const url = new URL("https://financialmodelingprep.com/stable/economic-indicators");
    url.searchParams.set("name", name);
    url.searchParams.set("apikey", key);

    const resp = await fetch(url.toString(), { cache: "no-store" });

    // Read body as text first; FMP may return "Invalid name" text with 200 OK
    const bodyText = await resp.text();
    const contentType = resp.headers.get("content-type") || "";

    // If non-OK, bubble up text (first 200 chars) as error
    if (!resp.ok) {
      return NextResponse.json(
        { data: [], error: `Upstream error ${resp.status}: ${bodyText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    // Try to parse JSON; if it fails, return text as a friendly error
    let parsed: unknown;
    try {
      // Only parse if header looks like JSON or if it "starts like" JSON
      if (contentType.includes("application/json") || /^[\[\{]/.test(bodyText.trim())) {
        parsed = JSON.parse(bodyText);
      } else {
        // FMP sometimes replies with e.g. "Invalid name"
        const msg = bodyText.trim() || "Upstream returned non-JSON";
        return NextResponse.json({ data: [], error: msg }, { status: 400 });
      }
    } catch {
      // JSON.parse failed (e.g., "Invalid name")
      const msg = bodyText.trim() || "Upstream returned non-JSON";
      return NextResponse.json({ data: [], error: msg }, { status: 400 });
    }

    type Raw = { date?: string; value?: number | string; name?: string; unit?: string };
    const rows: Raw[] = Array.isArray(parsed) ? (parsed as Raw[]) : ((parsed as any)?.data ?? []);

    if (!Array.isArray(rows)) {
      // Unexpected shape; show a concise error to the client
      return NextResponse.json(
        { data: [], error: "Unexpected upstream response format" },
        { status: 502 }
      );
    }

    // Normalize
    let data = rows.map((r) => ({
      date: r.date ?? null,
      value: r.value ?? null,
      name: r.name ?? name,
      unit: r.unit ?? null,
    }));

    // Date filter (inclusive)
    if ((start && start.length === 10) || (end && end.length === 10)) {
      data = data.filter((r) => inRange(r.date, start, end));
    }

    // Sort newest first
    data.sort((a, b) => {
      const ta = Date.parse(a.date || "");
      const tb = Date.parse(b.date || "");
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return tb - ta;
    });

    if (limit) data = data.slice(0, limit);

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json(
      { data: [], error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}