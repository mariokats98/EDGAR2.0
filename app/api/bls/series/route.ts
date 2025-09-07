import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bls/series?ids=CUUR0000SA0,LNS14000000&start=2015&end=2025&freq=monthly|annual
 *
 * - ids   (required): comma-separated BLS series IDs (max ~25 recommended)
 * - start (optional): start year YYYY (default: 2015)
 * - end   (optional): end year YYYY (default: current year)
 * - freq  (optional): "monthly" (default) or "annual" (server asks for annualaverage)
 *
 * Returns: { meta: {...}, data: [{ id,title,units,seasonal,observations:[{date,value}], latest }] }
 */

type BLSResp = {
  Results?: {
    series: {
      seriesID: string;
      data: { year: string; period: string; value: string }[];
    }[];
  };
  status?: string;
  message?: string[];
};

const API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

function normDate(year: string, period: string) {
  // period examples: "M01".."M12" (months), "M13" (annual average)
  if (/^M\d{2}$/.test(period)) {
    const mm = period.slice(1);
    return `${year}-${mm}-01`;
  }
  if (period === "M13") return `${year}-07-01`; // mid-year for annual avg
  return `${year}-01-01`;
}

// Optional friendly metadata (extend as you like)
const SERIES_HINTS: Record<string, { title: string; units: string; seasonal: "SA" | "NSA" }> = {
  CUUR0000SA0: { title: "CPI-U All Items (SA)", units: "Index 1982-84=100", seasonal: "SA" },
  LNS14000000: { title: "Unemployment Rate (SA)", units: "Percent", seasonal: "SA" },
  CES0000000001: { title: "Nonfarm Payrolls (SA)", units: "Thousands", seasonal: "SA" },
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url, "http://local");
    const idsParam = (url.searchParams.get("ids") || "").trim();
    if (!idsParam) return NextResponse.json({ error: "Missing ids." }, { status: 400 });

    const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean).slice(0, 25);
    const start = (url.searchParams.get("start") || "2015").replace(/\D/g, "");
    const end = (url.searchParams.get("end") || new Date().getFullYear().toString()).replace(/\D/g, "");
    const freq = (url.searchParams.get("freq") || "monthly").toLowerCase();

    const body: any = {
      seriesid: ids,
      startyear: start,
      endyear: end,
    };
    if (freq === "annual") body.annualaverage = true;
    if (process.env.BLS_API_KEY) body.registrationkey = process.env.BLS_API_KEY;

    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    const json = (await r.json()) as BLSResp;

    if (!r.ok || (json.status && json.status !== "REQUEST_SUCCEEDED")) {
      const msg = (json.message && json.message.join("; ")) || `BLS API error ${r.status}`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const out = (json.Results?.series || []).map((s) => {
      const id = s.seriesID;
      const meta = SERIES_HINTS[id] || { title: id, units: "", seasonal: "NSA" as const };

      // BLS returns newest first; normalize to ascending by date
      const observations = [...(s.data || [])]
        .filter(d => d && d.value && d.year && d.period)
        .map(d => ({ date: normDate(d.year, d.period), value: Number(d.value) }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      return {
        id,
        title: meta.title,
        units: meta.units,
        seasonal: meta.seasonal,
        observations,
        latest: observations.length ? observations[observations.length - 1] : null,
      };
    });

    return NextResponse.json(
      { meta: { request: { ids, start, end, freq } }, data: out },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

