// app/api/filings/[cik]/route.ts
import { NextRequest, NextResponse } from "next/server";

const SEC_UA = process.env.SEC_USER_AGENT || "herevna/1.0 (contact@herevna.io)";
const HEADERS = { "User-Agent": SEC_UA, Accept: "application/json; charset=utf-8" } as const;

type Row = {
  cik: string;
  company?: string;
  form: string;
  filed: string;
  accessionNumber: string;
  links: { indexHtml: string; dir: string; primary: string };
  download: string;
};

function toCIK10(input: string): string | null {
  const s = input.trim();
  if (/^\d{1,10}$/.test(s)) return s.padStart(10, "0");
  return null;
}

async function resolveToCIK10(input: string): Promise<{ cik10: string; display?: string } | null> {
  // If already a (short) CIK
  const c10 = toCIK10(input);
  if (c10) return { cik10: c10, display: `CIK ${c10}` };

  // Try SEC's official ticker file for ticker/company name
  try {
    const r = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: HEADERS, cache: "no-store" });
    if (!r.ok) return null;
    const data = (await r.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
    const list = Object.values(data);
    const q = input.trim().toLowerCase();

    let hit = list.find((x) => x.ticker.toLowerCase() === q); // exact ticker
    if (!hit) hit = list.find((x) => x.title.toLowerCase().includes(q)); // company name contains
    if (!hit) return null;

    return { cik10: String(hit.cik_str).padStart(10, "0"), display: `${hit.ticker} — ${hit.title}` };
  } catch {
    return null;
  }
}

async function getRecentFilings(cik10: string) {
  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const r = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!r.ok) throw new Error(`SEC submissions fetch failed (${r.status})`);
  const j = await r.json();

  const { filings, name } = j;
  const rec = filings?.recent;
  if (!rec) return [] as Row[];

  const rows: Row[] = [];
  const n = rec.accessionNumber?.length || 0;
  for (let i = 0; i < n; i++) {
    const acc = rec.accessionNumber[i];           // "0000320193-24-000123"
    const form = rec.form[i];
    const filed = rec.filingDate[i];              // "YYYY-MM-DD"
    const primaryDoc = rec.primaryDocument[i] || "";
    const accNoPlain = acc.replace(/-/g, "");
    const dir = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik10, 10)}/${accNoPlain}`;
    const indexHtml = `${dir}/index.htm`;
    const primary = primaryDoc ? `${dir}/${primaryDoc}` : indexHtml;

    rows.push({
      cik: cik10,
      company: name,
      form,
      filed,
      accessionNumber: acc,
      links: { indexHtml, dir, primary },
      download: primary,
    });
  }
  return rows;
}

function filterRows(
  rows: Row[],
  forms: string[] | null,
  start: string | null,
  end: string | null,
  q: string | null
) {
  const inRange = (d: string) => {
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  };
  const fset = forms && forms.length ? new Set(forms.map((s) => s.toUpperCase())) : null;
  const qq = q?.toLowerCase() || "";

  return rows.filter((r) => {
    if (!inRange(r.filed)) return false;
    if (fset && !fset.has(r.form.toUpperCase())) return false;
    if (qq) {
      const hay = `${r.accessionNumber} ${r.form} ${r.links.primary} ${r.links.indexHtml}`.toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  });
}

export async function GET(req: NextRequest, ctx: { params: { cik: string } }) {
  try {
    const idRaw = decodeURIComponent(ctx.params.cik || "").trim();
    if (!idRaw) {
      return NextResponse.json({ ok: false, error: "Missing identifier. Provide CIK, ticker, or company name." }, { status: 400 });
    }

    const url = new URL(req.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const formsParam = url.searchParams.get("forms");
    const perPage = Math.max(1, Math.min(200, parseInt(url.searchParams.get("perPage") || "50")));
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const freeText = url.searchParams.get("q");

    // Resolve whatever came in (CIK/ticker/name) to a 10-digit CIK
    const resolved = await resolveToCIK10(idRaw);
    if (!resolved?.cik10) {
      return NextResponse.json(
        { ok: false, error: "Ticker/Company not recognized. Pick from suggestions or enter a numeric CIK." },
        { status: 400 }
      );
    }
    const cik10 = resolved.cik10;

    const recent = await getRecentFilings(cik10);

    const forms = formsParam
      ? formsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const filtered = filterRows(recent, forms, start, end, freeText);

    // paginate
    const total = filtered.length;
    const offset = (page - 1) * perPage;
    const data = filtered.slice(offset, offset + perPage);

    return NextResponse.json({
      ok: true,
      total,
      count: data.length,
      data,
      query: {
        id: idRaw,
        resolvedCIK: cik10,
        start: start || "",
        end: end || "",
        forms: forms || [],
        perPage,
        page,
        freeText: freeText || "",
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}