import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- small helpers ----------
type Msg = { role: "system" | "user" | "assistant"; content: string };
type ChatReq = { messages: Msg[] };

function ok(payload: any, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...payload }, init);
}
function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
function siteBase() {
  // Prefer absolute URL when available (Vercel prod); else relative works server-side too
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "";
}
async function fetchJSON(url: string) {
  // Always no-store so we don't cache stale data
  const r = await fetch(url, { cache: "no-store" });
  const isJson = r.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await r.json().catch(() => null) : null;

  if (!r.ok) {
    const detail = body ? ` ${JSON.stringify(body).slice(0, 400)}` : "";
    throw new Error(`Fetch failed ${r.status} for ${url}.${detail}`);
  }
  return body;
}
function toMonthLabel(s?: string) {
  // Accept "YYYY-MM" or "YYYY-MM-DD"
  if (!s) return "";
  const [y, m] = s.split("-");
  const month = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ][parseInt(m, 10)] || m;
  return `${month} ${y}`;
}

// ---------- intent detection ----------
const FORM_WORDS = [
  "10-k","10-q","8-k","s-1","s-3","s-4","20-f","40-f","6-k",
  "11-k","13f-hr","sc 13d","sc 13d/a","sc 13g","sc 13g/a","def 14a","defa14a","px14a6g","3","4","5"
];
function looksLikeTicker(word: string) {
  // Rough ticker heuristic: 1-6 letters/numbers, allow dot class (e.g., BRK.B)
  return /^[A-Z]{1,6}(\.[A-Z])?$/.test(word.toUpperCase());
}
function extractSECQuery(text: string) {
  // Find a form and a candidate identifier (ticker/company/CIK)
  const lower = text.toLowerCase();
  const foundForm = FORM_WORDS.find(f => lower.includes(f));
  if (!foundForm) return null;

  // Try patterns: "NVDA 10-K", "10-K for NVDA", "file 10-K for NVIDIA", etc.
  // 1) look for "for <word>"
  const forMatch = text.match(/\bfor\s+([A-Za-z0-9\.\-& ]{1,60})/i);
  let ident = forMatch?.[1]?.trim();
  if (!ident) {
    // 2) find last ALLCAPS-ish token near the end
    const tokens = text.replace(/[^A-Za-z0-9\.\- ]/g, " ").split(/\s+/).filter(Boolean);
    const caps = [...tokens].reverse().find(t => looksLikeTicker(t));
    if (caps) ident = caps.toUpperCase();
  }
  // If still nothing, try any non-empty word after the form
  if (!ident) {
    const afterForm = text.split(new RegExp(foundForm, "i"))[1]?.trim() || "";
    ident = afterForm.split(/[.,;:!?]/)[0]?.trim();
  }

  return {
    form: foundForm.toUpperCase().replace(/\s+/g, ""),
    ident: (ident || "").trim()
  };
}

function wantCPI(t: string)        { t = t.toLowerCase(); return /\bcpi\b|inflation rate|consumer price/.test(t); }
function wantCoreCPI(t: string)    { t = t.toLowerCase(); return /core cpi|cpi ex(-|\s)?food|cpi ex.*energy/i.test(t); }
function wantPPI(t: string)        { t = t.toLowerCase(); return /\bppi\b|producer price/i.test(t); }
function wantUnemp(t: string)      { t = t.toLowerCase(); return /unemployment|jobless rate|\bu-3\b/i.test(t); }
function wantNFP(t: string)        { t = t.toLowerCase(); return /nonfarm|nfp|payroll(s)?/i.test(t); }
function wantRetail(t: string)     { t = t.toLowerCase(); return /retail sales|marts/i.test(t); }
function wantHousingStarts(t: string){ t = t.toLowerCase(); return /housing starts|new residential construction/i.test(t); }
function wantNewHomeSales(t: string){ t = t.toLowerCase(); return /new home sales/i.test(t); }
function wantGDP(t: string)        { t = t.toLowerCase(); return /\bgdp\b|gross domestic product|bea/i.test(t); }

// ---------- main handler ----------
const SYSTEM_PROMPT = `
You are Herevna AI — a concise assistant for finance, markets, economic data, and SEC filings.
Rules:
- Prefer live endpoints from this app (/api/bls/series, /api/fred/*, /api/filings/*, /api/census/*, /api/bea/*).
- Return current figures with month/quarter labels, then 1-line context.
- Always include a source link (BLS, FRED, SEC, Census, BEA).
- Be concise and skimmable. Use bold for key numbers/labels.
`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatReq;
    const messages = body?.messages || [];
    const userText = messages[messages.length - 1]?.content || "";

    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) return bad("Missing DEEPSEEK_API_KEY env var", 500);

    // ========= 1) EDGAR filings intent =========
    const secAsk = extractSECQuery(userText);
    if (secAsk?.form && secAsk.ident) {
      // Use your filings route which resolves ticker/name/CIK
      const params = new URLSearchParams({
        start: "2000-01-01",
        end: new Date().toISOString().slice(0,10),
        forms: secAsk.form,        // e.g., 10-K
        perPage: "1",
        page: "1"
      });
      const url = `${siteBase()}/api/filings/${encodeURIComponent(secAsk.ident)}?${params}`;
      const j = await fetchJSON(url);
      const row = j?.data?.[0];
      if (!row) return bad(`No ${secAsk.form} found for "${secAsk.ident}". Try a different form or identifier.`, 404);

      const txt = `**${row.company || row.cik} — ${row.form}** filed **${row.filed}**  
Open / download: ${row.links?.primary || row.download || row.links?.indexHtml || "Unavailable"}  
Source (SEC EDGAR): https://www.sec.gov/edgar/search/`;
      return ok({ text: txt });
    }

    // ========= 2) Economic data intents =========
    // CPI (headline). Try /api/bls first. If it fails, fallback to FRED CPIAUCSL YoY.
    if (wantCPI(userText)) {
      try {
        const j = await fetchJSON(`${siteBase()}/api/bls/series?ids=CUUR0000SA0R&freq=monthly&latest=1`);
        const pt = j?.series?.[0]?.data?.[0];
        if (pt) {
          const txt = `**US CPI (YoY)** — **${Number(pt.value).toFixed(1)}%** in **${toMonthLabel(pt.date)}**.  
BLS release: https://www.bls.gov/news.release/cpi.toc.htm`;
          return ok({ text: txt });
        }
      } catch { /* fallthrough */ }
      // Fallback: FRED CPIAUCSL YoY (calculated on server)
      const fred = await fetchJSON(`${siteBase()}/api/fred/series?series_id=CPIAUCSL&transform=yoy&latest=1`);
      const fp = fred?.data?.[0];
      if (!fp) return bad("CPI data unavailable", 502);
      const txt = `**US CPI (YoY)** — **${Number(fp.value).toFixed(1)}%** in **${toMonthLabel(fp.date)}**.  
Source: FRED (BLS CPIAUCSL). https://fred.stlouisfed.org/series/CPIAUCSL`;
      return ok({ text: txt });
    }

    // Core CPI
    if (wantCoreCPI(userText)) {
      // FRED series: CPILFESL (Core CPI, SA Index). We'll return YoY via your FRED proxy
      const fred = await fetchJSON(`${siteBase()}/api/fred/series?series_id=CPILFESL&transform=yoy&latest=1`);
      const pt = fred?.data?.[0];
      if (!pt) return bad("Core CPI data unavailable", 502);
      const txt = `**US Core CPI (YoY)** — **${Number(pt.value).toFixed(1)}%** in **${toMonthLabel(pt.date)}**.  
Source: FRED (CPILFESL). https://fred.stlouisfed.org/series/CPILFESL`;
      return ok({ text: txt });
    }

    // PPI (Final demand YoY). BLS fallback to FRED CRBOBLPPIPROC? Simpler: FRED PPIACO YoY (All Commodities)
    if (wantPPI(userText)) {
      const fred = await fetchJSON(`${siteBase()}/api/fred/series?series_id=PPIACO&transform=yoy&latest=1`);
      const pt = fred?.data?.[0];
      if (!pt) return bad("PPI data unavailable", 502);
      const txt = `**US PPI (YoY)** — **${Number(pt.value).toFixed(1)}%** in **${toMonthLabel(pt.date)}**.  
Source: FRED (PPIACO). https://fred.stlouisfed.org/series/PPIACO`;
      return ok({ text: txt });
    }

    // Unemployment rate (U-3)
    if (wantUnemp(userText)) {
      try {
        const j = await fetchJSON(`${siteBase()}/api/bls/series?ids=LNS14000000&freq=monthly&latest=1`);
        const pt = j?.series?.[0]?.data?.[0];
        if (pt) {
          const txt = `**US Unemployment Rate (U-3)** — **${Number(pt.value).toFixed(1)}%** in **${toMonthLabel(pt.date)}**.  
BLS Employment Situation: https://www.bls.gov/news.release/empsit.toc.htm`;
          return ok({ text: txt });
        }
      } catch { /* fallthrough */ }
      const fred = await fetchJSON(`${siteBase()}/api/fred/series?series_id=UNRATE&latest=1`);
      const pt = fred?.data?.[0];
      if (!pt) return bad("Unemployment data unavailable", 502);
      const txt = `**US Unemployment Rate (U-3)** — **${Number(pt.value).toFixed(1)}%** in **${toMonthLabel(pt.date)}**.  
Source: FRED (UNRATE). https://fred.stlouisfed.org/series/UNRATE`;
      return ok({ text: txt });
    }

    // NFP (change in payrolls). Use FRED PAYEMS (level); show monthly change.
    if (wantNFP(userText)) {
      const fred = await fetchJSON(`${siteBase()}/api/fred/series?series_id=PAYEMS&transform=diff&latest=1`);
      const pt = fred?.data?.[0];
      if (!pt) return bad("Payrolls data unavailable", 502);
      const val = Math.round(Number(pt.value));
      const txt = `**US Nonfarm Payrolls (change)** — **${val.toLocaleString()}** in **${toMonthLabel(pt.date)}**.  
Source: FRED (PAYEMS). https://fred.stlouisfed.org/series/PAYEMS`;
      return ok({ text: txt });
    }

    // Retail sales (Census → fallback FRED RSAFS MoM or YoY)
    if (wantRetail(userText)) {
      // FRED: RSAFS (Retail Sales, SA, Mil.$). Return MoM %.
      const fred = await fetchJSON(`${siteBase()}/api/fred/series?series_id=RSAFS&transform=mom&latest=1`);
      const pt = fred?.data?.[0];
      if (!pt) return bad("Retail sales data unavailable", 502);
      const txt = `**US Retail Sales (MoM)** — **${Number(pt.value).toFixed(1)}%** in **${toMonthLabel(pt.date)}**.  
Source: Census via FRED (RSAFS). https://fred.stlouisfed.org/series/RSAFS`;
      return ok({ text: txt });
    }

    // Housing starts
    if (wantHousingStarts(userText)) {
      const fred = await fetchJSON(`${siteBase()}/api/fred/series?series_id=HOUST&latest=1`);
      const pt = fred?.data?.[0];
      if (!pt) return bad("Housing starts data unavailable", 502);
      const txt = `**US Housing Starts** — **${Number(pt.value).toLocaleString()}** (SAAR) in **${toMonthLabel(pt.date)}**.  
Source: Census/HUD via FRED (HOUST). https://fred.stlouisfed.org/series/HOUST`;
      return ok({ text: txt });
    }

    // New home sales
    if (wantNewHomeSales(userText)) {
      const fred = await fetchJSON(`${siteBase()}/api/fred/series?series_id=HSN1F&latest=1`);
      const pt = fred?.data?.[0];
      if (!pt) return bad("New home sales data unavailable", 502);
      const txt = `**US New Home Sales** — **${Number(pt.value).toLocaleString()}** (SAAR) in **${toMonthLabel(pt.date)}**.  
Source: Census via FRED (HSN1F). https://fred.stlouisfed.org/series/HSN1F`;
      return ok({ text: txt });
    }

    // GDP (BEA). Prefer BEA route if you’ve added it; fallback to FRED GDPC1 YoY or QoQ SAAR.
    if (wantGDP(userText)) {
      try {
        const bea = await fetchJSON(`${siteBase()}/api/bea?table=NIPA_GDP&latest=1`);
        const pt = bea?.data?.[0];
        if (pt?.value && pt?.period) {
          const txt = `**US Real GDP (QoQ SAAR)** — **${Number(pt.value).toFixed(1)}%** in **${pt.period}**.  
Source: BEA. https://www.bea.gov/news`;
          return ok({ text: txt });
        }
      } catch { /* fallthrough */ }
      const fred = await fetchJSON(`${siteBase()}/api/fred/series?series_id=GDPC1&transform=qoq_saar&latest=1`);
      const pt = fred?.data?.[0];
      if (!pt) return bad("GDP data unavailable", 502);
      const txt = `**US Real GDP (QoQ SAAR)** — **${Number(pt.value).toFixed(1)}%** in **${pt.date}**.  
Source: FRED (GDPC1). https://fred.stlouisfed.org/series/GDPC1`;
      return ok({ text: txt });
    }

    // ========= 3) Else, ask the model (non-streaming) =========
    const upstream = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.2,
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
      }),
    });

    if (!upstream.ok) {
      let detail = "";
      try { detail = (await upstream.json())?.error?.message || ""; } catch {}
      return NextResponse.json(
        { ok: false, error: `Upstream error (${upstream.status})`, detail },
        { status: upstream.status }
      );
    }

    const data = await upstream.json();
    const text =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      "";

    if (!text) return bad("Upstream returned empty content", 502);
    return ok({ text });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}