// app/api/ai/chat/route.ts
import { NextResponse } from "next/server";

/** ---------- Runtime ---------- */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ---------- Env ---------- */
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const BLS_API_KEY = process.env.BLS_API_KEY; // optional for /api/bls/series if your route requires it
const BEA_API_KEY = process.env.BEA_API_KEY; // required if we hit BEA directly
const SEC_USER_AGENT = process.env.SEC_USER_AGENT || "herevna.ai (admin@herevna.io)";

/** ---------- CORS helpers ---------- */
function withCORS(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res;
}
export async function OPTIONS() {
  return withCORS(new NextResponse(null, { status: 200 }));
}

/** ---------- Simple intent detection ---------- */
type Intent = "edgar" | "bls" | "bea" | "generic";
function detectIntent(q: string): Intent {
  const s = q.toLowerCase();
  const edgarTerms = [
    "edgar", "sec", "10-k", "10k", "10-q", "10q", "8-k", "8k", "s-1", "s1",
    "424b", "13d", "13g", "sc 13", "6-k", "6k", "form 3", "form 4", "form 5",
    "cik", "accession", "filing", "prospectus"
  ];
  const blsTerms = ["bls", "unemployment", "cpi", "payroll", "ahe", "productivity", "labor", "ppi", "jobs report"];
  const beaTerms = ["bea", "gdp", "pce", "income", "iip", "international", "by industry", "nipa"];

  if (edgarTerms.some(t => s.includes(t))) return "edgar";
  if (blsTerms.some(t => s.includes(t))) return "bls";
  if (beaTerms.some(t => s.includes(t))) return "bea";
  return "generic";
}

/** ---------- Utilities ---------- */
function jsonOK<T = any>(data: T, init: number | ResponseInit = 200) {
  return withCORS(NextResponse.json(data as any, typeof init === "number" ? { status: init } : init));
}

function toCIK10(cik: string) {
  const digits = cik.replace(/\D/g, "");
  return digits.padStart(10, "0");
}

function parsePossibleTickerOrCIK(q: string) {
  // crude: if it looks like a ticker (letters + dots/dashes) or a 10-digit CIK
  const mTicker = q.match(/\b([A-Z]{1,5}(?:\.[A-Z])?)\b/);
  const mCIK = q.match(/\b(\d{7,10})\b/);
  return { ticker: mTicker?.[1] ?? null, cik: mCIK?.[1] ?? null };
}

function cleanText(t: string) {
  return t.replace(/\s+/g, " ").trim();
}

/** ---------- Retrieval: EDGAR ---------- */
async function resolveCIKFromSymbolOrName(prompt: string) {
  // 1) Try /api/lookup first (your local resolver that supports tickers & names)
  try {
    const u = new URL(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/lookup/dummy`, "http://localhost");
    // But your lookup route is /api/lookup/[symbol], so we’ll try to extract a symbol from the prompt:
    const { ticker, cik } = parsePossibleTickerOrCIK(prompt.toUpperCase());
    if (cik) return { cik: toCIK10(cik), how: "direct-cik" };
    if (ticker) {
      const r = await fetch(`/api/lookup/${encodeURIComponent(ticker)}`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j?.cik) return { cik: toCIK10(String(j.cik)), how: "lookup" };
      }
    }
  } catch {}
  // 2) Try fuzzy suggestions you added (/api/suggest?q=)
  try {
    const params = new URLSearchParams({ q: prompt });
    const r = await fetch(`/api/suggest?${params.toString()}`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const top = Array.isArray(j?.suggestions) ? j.suggestions[0] : null;
      if (top?.cik) return { cik: toCIK10(String(top.cik)), how: "suggest" };
    }
  } catch {}
  return null;
}

async function fetchLatestEdgarFilings(cik10: string, count = 10) {
  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const r = await fetch(url, {
    headers: { "User-Agent": SEC_USER_AGENT, "Accept": "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`SEC fetch failed ${r.status}`);
  const data = await r.json();

  const recent = data?.filings?.recent;
  if (!recent) return { companyName: data?.name || "Company", filings: [] as any[] };

  const n = Math.min(count, (recent?.accessionNumber || []).length);
  const cikRaw = String(parseInt(cik10, 10)); // without leading zeros
  const out: Array<{
    form: string;
    filedAt: string;
    accession: string;
    title: string;
    indexUrl: string;
    primaryDocUrl?: string | null;
  }> = [];

  for (let i = 0; i < n; i++) {
    const acc = String(recent.accessionNumber[i]);
    const form = String(recent.form[i] || "");
    const date = String(recent.filingDate[i] || "");
    const primaryDoc = String(recent.primaryDocument[i] || "");
    const accNoDash = acc.replace(/-/g, "");
    const base = `https://www.sec.gov/Archives/edgar/data/${cikRaw}/${accNoDash}`;
    const indexUrl = `${base}/${acc}-index.htm`;
    const primaryDocUrl = primaryDoc ? `${base}/${primaryDoc}` : null;
    out.push({
      form,
      filedAt: date,
      accession: acc,
      title: `${form} • ${date}`,
      indexUrl,
      primaryDocUrl,
    });
  }

  return {
    companyName: data?.name || "Company",
    filings: out,
  };
}

/** ---------- Retrieval: BLS ---------- */
async function fetchBlsSeriesForPrompt(prompt: string) {
  // Map simple keywords → series IDs your /api/bls/series supports
  const want: string[] = [];
  const s = prompt.toLowerCase();
  if (s.includes("cpi")) want.push("CUUR0000SA0");
  if (s.includes("unemployment")) want.push("LNS14000000");
  if (s.includes("payroll")) want.push("CES0000000001");
  if (s.includes("earnings")) want.push("CES0500000003");
  if (s.includes("productivity")) want.push("PRS85006093");
  // If nothing matched, default to CPI
  if (want.length === 0) want.push("CUUR0000SA0");

  const params = new URLSearchParams({
    ids: want.join(","),
    start: "2018",
    end: String(new Date().getFullYear()),
    freq: "monthly",
  });
  const r = await fetch(`/api/bls/series?${params.toString()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`BLS route failed ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.data) ? j.data : [];
}

/** ---------- Retrieval: BEA ---------- */
async function fetchBeaRealGDPQuarterly() {
  // Real GDP (chained 2017 dollars) from NIPA Table 1.1.6 (as an example)
  // API docs: https://apps.bea.gov/api/signup/index.cfm
  if (!BEA_API_KEY) throw new Error("Missing BEA_API_KEY");
  // Sample: Dataset=NIPA, TableName=T10106 (or T10106 for real GDP in chained dollars),
  // Frequency=Q, Year=ALL
  const qs = new URLSearchParams({
    UserID: BEA_API_KEY,
    method: "GetData",
    datasetname: "NIPA",
    TableName: "T10106",
    Frequency: "Q",
    Year: "ALL",
    ResultFormat: "JSON",
  });
  const url = `https://apps.bea.gov/api/data?${qs.toString()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`BEA fetch failed ${r.status}`);
  const j = await r.json();
  const rows = j?.BEAAPI?.Results?.Data || [];
  // Return most recent ~20 quarters
  const cleaned = rows
    .filter((d: any) => d?.TimePeriod && d.LineDescription === "Gross domestic product")
    .map((d: any) => ({
      date: String(d.TimePeriod), // e.g., 2024Q4
      value: parseFloat(d.DataValue?.replace(/,/g, "")),
      unit: d.UnitOfMeasure,
    }))
    .filter((x: any) => Number.isFinite(x.value))
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  return cleaned.slice(-20);
}

/** ---------- LLM call (DeepSeek) ---------- */
async function llmSummarize(context: string, userPrompt: string) {
  if (!DEEPSEEK_API_KEY) {
    // Return plain formatted context without LLM if missing key
    return `**Results**\n\n${context}\n\n_(LLM unavailable: missing DEEPSEEK_API_KEY)_`;
  }

  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            [
              "You are Herevna's analyst.",
              "Rules:",
              "- Never invent filing links or data. Only use supplied context.",
              "- Prefer bullet points and clean formatting.",
              "- For EDGAR, always include direct, clickable download links (index & primary doc if available).",
              "- Keep answers tight but useful.",
            ].join("\n"),
        },
        { role: "assistant", content: `Context:\n${context}` },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return `**Results**\n\n${context}\n\n_Chat summarize unavailable (DeepSeek ${r.status}). Raw context shown._`;
  }
  const j = await r.json();
  return j?.choices?.[0]?.message?.content ?? `**Results**\n\n${context}`;
}

/** ---------- Handlers by intent ---------- */
async function handleEDGAR(prompt: string) {
  // 1) Resolve CIK
  const parsed = parsePossibleTickerOrCIK(prompt.toUpperCase());
  let cik = parsed.cik ? toCIK10(parsed.cik) : null;

  if (!cik) {
    const resolved = await resolveCIKFromSymbolOrName(prompt);
    if (resolved?.cik) cik = resolved.cik;
  }
  if (!cik) {
    // Try last resort: user must give ticker/CIK/company name
    const ctx = `No CIK could be resolved from: "${cleanText(prompt)}".
Try searching with a ticker (AAPL), company name (APPLE), or a 10-digit CIK.`;
    return { message: await llmSummarize(ctx, prompt) };
  }

  // 2) Fetch recent filings
  const { companyName, filings } = await fetchLatestEdgarFilings(cik, 10);

  if (!filings.length) {
    const ctx = `No recent filings found for CIK ${cik} (${companyName}).`;
    return { message: await llmSummarize(ctx, prompt) };
  }

  // 3) Prepare context with real links (NO hallucinations)
  const lines = [
    `Company: **${companyName}** (CIK ${cik})`,
    `Recent filings (max 10):`,
    ...filings.map(
      (f) =>
        `- **${f.form}** • ${f.filedAt} • Accession ${f.accession}\n  ` +
        `Index: ${f.indexUrl}\n  ` +
        (f.primaryDocUrl ? `Primary doc: ${f.primaryDocUrl}` : "")
    ),
  ].join("\n");

  const message = await llmSummarize(lines, prompt);
  return { message };
}

async function handleBLS(prompt: string) {
  const data = await fetchBlsSeriesForPrompt(prompt);
  if (!data || data.length === 0) {
    const ctx = `No BLS series matched the query: "${cleanText(prompt)}". Try CPI, unemployment, payrolls, earnings, productivity.`;
    return { message: await llmSummarize(ctx, prompt) };
  }
  // Build a tiny context (latest datapoint + short URL to series endpoint)
  const lines: string[] = ["BLS series:"];
  data.forEach((s: any) => {
    const latest = s?.observations?.[s.observations.length - 1];
    lines.push(
      `- **${s.title || s.id}** • Latest: ${latest?.date} → ${latest?.value} (${s.units || ""})`
    );
  });
  const message = await llmSummarize(lines.join("\n"), prompt);
  return { message };
}

async function handleBEA(prompt: string) {
  // Basic: real GDP quarterly recent slice
  const gdp = await fetchBeaRealGDPQuarterly();
  if (!gdp.length) {
    const ctx = `BEA real GDP (quarterly) returned no data.`;
    return { message: await llmSummarize(ctx, prompt) };
  }
  const lines = [
    "Real GDP (chained 2017 dollars, quarterly, most recent ~20):",
    ...gdp.map((r) => `- ${r.date}: ${r.value.toLocaleString()} (${r.unit || "chained 2017 USD"})`),
  ].join("\n");
  const message = await llmSummarize(lines, prompt);
  return { message };
}

/** ---------- Main POST ---------- */
export async function POST(req: Request) {
  try {
    const { prompt } = await req.json().catch(() => ({}));
    if (!prompt || typeof prompt !== "string") {
      return jsonOK({ error: "Missing prompt" }, 400);
    }

    // Quick “thinking” hint for the client: they already show a spinner; keep server fast
    const intent = detectIntent(prompt);

    let out: { message: string };
    if (intent === "edgar") out = await handleEDGAR(prompt);
    else if (intent === "bls") out = await handleBLS(prompt);
    else if (intent === "bea") out = await handleBEA(prompt);
    else {
      // Generic: just call LLM, no retrieval
      const message = await llmSummarize("No structured context. Answer briefly and clearly.", prompt);
      out = { message };
    }

    return jsonOK(out, 200);
  } catch (e: any) {
    return jsonOK({ error: e?.message || "Unexpected server error" }, 500);
  }
}
