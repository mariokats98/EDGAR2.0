// app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deepseekChat } from "@/lib/ai";
import { getBaseUrl, httpJSON } from "@/lib/http";

// Types you already return from your endpoints
type LookupResult =
  | { ok: true; kind: "cik"; cik: string; name?: string; ticker?: string }
  | { ok: true; kind: "symbol"; cik: string; name?: string; ticker?: string }
  | { ok: false; error: string };

type FilingRow = {
  cik: string; company?: string; form: string; filed: string; accessionNumber: string;
  links: { indexHtml: string; dir: string; primary: string };
  download: string;
};
type FilingsResponse = {
  ok: boolean; total: number; count: number; data: FilingRow[];
  query: any;
};

type FredSeriesResponse = {
  ok: boolean;
  seriesId: string;
  title: string;
  frequency: string;
  data: { date: string; value: number }[];
  units?: string;
};

type BLSResponse = {
  ok: boolean;
  series: { id: string; title: string; data: { period: string; year: number; value: number; periodName?: string }[] }[];
};

type NewsResponse = {
  ok: boolean;
  items: { title: string; url: string; source?: string; published?: string }[];
};

type BEAResponse = {
  ok: boolean;
  table?: string;
  title?: string;
  data?: { time: string; value: number }[];
  units?: string;
};

// ------------ Simple intent detection ------------
function detectIntent(q: string) {
  const s = q.toLowerCase();
  if (/\b(cpi|consumer price index|inflation)\b/.test(s)) return "bls.cpi";
  if (/\bgdp\b/.test(s)) return "fred.gdp"; // you also have /api/gdp if you prefer
  if (/\b(pce|personal consumption)\b/.test(s)) return "fred.pce";
  if (/\bedgar\b|\bfiling|\b10-k\b|\b10q\b|\b10-q\b|\b8-k\b|\b6-k\b|\b20-f\b|\bform\b|\bprospectus\b|\bs-1\b/.test(s)) return "edgar";
  if (/\bnews\b|\bheadline\b/.test(s)) return "news";
  if (/\bbea\b/.test(s)) return "bea";
  return "mixed";
}

// try to pick a symbol/CIK-ish chunk
function guessIdentifier(msg: string) {
  const m = msg.match(/\b[A-Z]{1,5}(\.[A-Z])?(-[A-Z])?\b/); // NVDA, BRK.B, RDS-A
  return m?.[0];
}

// Build markdown of filings with single “Open / Download” button
function filingsToMarkdown(rows: FilingRow[], limit = 10) {
  if (!rows?.length) return "_No filings found._";
  const top = rows.slice(0, limit);
  return top.map(r =>
`**${r.form}** — ${r.filed}  
${r.company || r.cik}  
Accession: \`${r.accessionNumber}\`  
[Open / Download](${r.links.primary})  ·  [Index](${r.links.indexHtml})`).join("\n\n");
}

// Small helper to clamp dates
function clampDate(str: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : new Date().toISOString().slice(0,10);
}

export async function POST(req: NextRequest) {
  try {
    const { messages, question } = await req.json();
    const userQ: string = question || messages?.slice()?.reverse()?.find((m: any) => m.role === "user")?.content || "";
    if (!userQ?.trim()) {
      return NextResponse.json({ ok: false, error: "Empty question" }, { status: 400 });
    }

    const base = getBaseUrl(req);
    const intent = detectIntent(userQ);
    const idGuess = guessIdentifier(userQ);

    // resolve symbol/company → CIK (best-effort)
    let resolved: { cik?: string; name?: string; ticker?: string } = {};
    if (intent === "edgar" || intent === "news" || intent === "mixed" || idGuess) {
      try {
        const lookup = await httpJSON<LookupResult>(`${base}/api/lookup/${encodeURIComponent(idGuess || userQ.trim())}`);
        if ((lookup as any).ok && (lookup as any).cik) {
          resolved.cik = (lookup as any).cik;
          resolved.ticker = (lookup as any).ticker;
          resolved.name = (lookup as any).name;
        }
      } catch {
        // leave unresolved – we’ll still try generic answers
      }
    }

    // --------- ROUTING ----------
    let contextBlocks: string[] = [];
    let finalAnswer = "";

    if (intent === "edgar") {
      if (!resolved.cik) {
        finalAnswer = `I couldn't confidently identify the company. Try entering a ticker like **NVDA** or a CIK.`;
      } else {
        // Pull the most recent filings (last 90 days) unless user specified forms
        const want6k = /\b6-k\b/i.test(userQ);
        const want10k = /\b10-?k\b/i.test(userQ);
        const want8k  = /\b8-?k\b/i.test(userQ);
        const want20f = /\b20-?f\b/i.test(userQ);
        let forms = ["10-K","10-Q","8-K","6-K","20-F"];
        if (want6k) forms = ["6-K"];
        else if (want10k) forms = ["10-K"];
        else if (want8k) forms = ["8-K"];
        else if (want20f) forms = ["20-F"];

        const today = new Date();
        const start = new Date(today.getTime() - 1000*60*60*24*90).toISOString().slice(0,10);
        const end = today.toISOString().slice(0,10);

        const params = new URLSearchParams({
          start, end, forms: forms.join(","), perPage: "50", page: "1",
        });

        const filings = await httpJSON<FilingsResponse>(`${base}/api/filings/${resolved.cik}?${params}`);
        contextBlocks.push(`Company: ${resolved.name || ""} (${resolved.ticker || ""}) — CIK ${resolved.cik}`);
        contextBlocks.push(`Results: ${filings.total} total, showing top ${Math.min(filings.data.length, 10)}`);
        finalAnswer = filingsToMarkdown(filings.data, 10);
      }
    }

    else if (intent === "bls.cpi") {
      const series = await httpJSON<BLSResponse>(`${base}/api/bls/series?ids=CUUR0000SA0`);
      const s = series.series?.[0];
      if (!s || !s.data?.length) finalAnswer = "_No CPI data returned._";
      else {
        const last = s.data[0];
        contextBlocks.push(`Series: ${s.title || "CPI-U All Items, SA"}`);
        finalAnswer = `**US CPI (All Items, SA)**  
Latest: **${last.value}** (Index, ${last.periodName || ""} ${last.year})  
Source: BLS.`;
      }
    }

    else if (intent === "fred.gdp") {
      const fred = await httpJSON<FredSeriesResponse>(`${base}/api/fred/series?id=GDPC1`);
      if (!fred?.data?.length) finalAnswer = "_No GDP data returned._";
      else {
        const last = fred.data[fred.data.length - 1];
        finalAnswer = `**Real GDP (GDPC1, chained 2017 $)**  
Latest: **${last.value.toLocaleString()}** (${last.date})  
Frequency: ${fred.frequency}. Source: FRED.`;
      }
    }

    else if (intent === "news") {
      if (!resolved.cik && !idGuess) {
        finalAnswer = `Give me a company/ticker (e.g., **NVDA**) for headlines, or ask “market headlines”.`;
      } else {
        const q = resolved.ticker || resolved.name || idGuess!;
        const news = await httpJSON<NewsResponse>(`${base}/api/news?q=${encodeURIComponent(q)}`);
        if (!news.items?.length) finalAnswer = `_No recent headlines for ${q}._`;
        else {
          finalAnswer = news.items.slice(0, 8).map(n =>
            `- [${n.title}](${n.url}) ${n.source ? `— *${n.source}*` : ""}${n.published ? ` (${n.published})` : ""}`
          ).join("\n");
        }
      }
    }

    else if (intent === "bea") {
      // Example: call your /api/bea or /api/gdp route
      const bea = await httpJSON<BEAResponse>(`${base}/api/gdp`);
      if (!bea?.data?.length) finalAnswer = `_No BEA data returned._`;
      else {
        const last = bea.data[bea.data.length - 1];
        finalAnswer = `**BEA: Real GDP**  
Latest: **${last.value.toLocaleString()}** (${last.time})  
Units: ${bea.units || "Chained $ (2017)"}  
Source: BEA.`;
      }
    }

    else {
      // Mixed/general: try to enrich context (EDGAR + headlines) then let DeepSeek summarize
      let enrich: string[] = [];
      if (resolved.cik) {
        try {
          const today = new Date();
          const start = new Date(today.getTime() - 1000*60*60*24*30).toISOString().slice(0,10);
          const end = today.toISOString().slice(0,10);
          const params = new URLSearchParams({ start, end, forms: "10-K,10-Q,8-K,6-K,20-F", perPage: "20", page: "1" });
          const filings = await httpJSON<FilingsResponse>(`${base}/api/filings/${resolved.cik}?${params}`);
          enrich.push(`Latest filings (${resolved.ticker || ""} / CIK ${resolved.cik}):\n${filingsToMarkdown(filings.data, 6)}`);
        } catch {}
        try {
          const q = resolved.ticker || resolved.name || "";
          if (q) {
            const news = await httpJSON<NewsResponse>(`${base}/api/news?q=${encodeURIComponent(q)}`);
            if (news.items?.length) {
              const block = news.items.slice(0, 5).map(n => `• ${n.title} — ${n.url}`).join("\n");
              enrich.push(`Recent headlines:\n${block}`);
            }
          }
        } catch {}
      }

      const system =
`You are a finance/economics assistant. Only use facts supplied in the CONTEXT.
If something is unknown or unreturned, say so briefly and suggest the exact query the user can try.
Prefer precise numbers, dates, tickers, CIKs, and provide clean markdown with short bullets.
Always include direct links when you reference filings.`;

      const content =
`USER QUESTION:
${userQ}

CONTEXT (may be empty, but do not fabricate):
${enrich.concat(contextBlocks).join("\n\n") || "(none)"}

RESPONSE REQUIREMENTS:
- Be concise, correct, and current.
- If giving filings, show at most 10 with "Open / Download" links.
- If a series is requested, show the latest value with date and unit.
- If nothing returned, explain what input would succeed (e.g., “Try ticker NVDA”).`;

      const text = await deepseekChat([
        { role: "system", content: system },
        { role: "user", content },
      ]);

      finalAnswer = text;
    }

    const preface = "⌛ Processing live data…\n\n";
    const ctx = contextBlocks.length ? `\n\n---\n\n<sup>Context: ${contextBlocks.join(" • ")}</sup>` : "";
    return NextResponse.json({ ok: true, answer: preface + finalAnswer + ctx });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "AI route error" }, { status: 500 });
  }
}