// app/api/census/data/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/census/data?name=GDP&start=YYYY-MM-DD&end=YYYY-MM-DD&limit=1000
 * Proxies your cached FMP route (/api/fmp/...) and returns normalized rows:
 *   { date, value, name, unit }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams, origin } = new URL(req.url);
    const name = (searchParams.get("name") || "").trim();
    const start = searchParams.get("start"); // YYYY-MM-DD
    const end = searchParams.get("end");     // YYYY-MM-DD
    const limit = Math.max(1, Math.min(5000, Number(searchParams.get("limit") || 1000)));

    if (!name) {
      return NextResponse.json({ data: [], error: "Missing indicator name" }, { status: 400 });
    }

    // Hit your internal FMP proxy (keeps API key server-only, cached + rate-limited)
    const upstream = new URL(origin + "/api/fmp/stable/economic-indicators");
    upstream.searchParams.set("name", name);

    const resp = await fetch(upstream.toString(), { cache: "no-store" });
    if (!resp.ok) {
      const txt = await resp.text();
      return NextResponse.json(
        { data: [], error: `Upstream error ${resp.status}: ${txt.slice(0, 200)}` },
        { status: 502 }
      );
    }

    type Raw = { date?: string; value?: number | string; name?: string; unit?: string };
    const raw = await resp.json();
    const rows: Raw[] = Array.isArray(raw) ? raw : (raw?.data ?? []);

    let data = rows.map((r) => ({
      date: r.date ?? null,
      value: r.value ?? null,
      name: r.name ?? name,
      unit: r.unit ?? null,
    }));

    // Inclusive date filter
    const inRange = (d: string | null) => {
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
    };

    if ((start && start.length === 10) || (end && end.length === 10)) {
      data = data.filter((r) => inRange(r.date));
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
    return NextResponse.json({ data: [], error: e?.message || "Unknown error" }, { status: 500 });
  }
}