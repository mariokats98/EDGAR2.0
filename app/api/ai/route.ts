// app/api/ai/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** ---------- Config ---------- */
const PROVIDER = process.env.LLM_PROVIDER || "openai"; // "openai" | "deepseek"
const MODEL = process.env.LLM_MODEL || (PROVIDER === "deepseek" ? "deepseek-chat" : "gpt-4o-mini");

function llmEndpoint() {
  if (PROVIDER === "deepseek") return "https://api.deepseek.com/chat/completions";
  return "https://api.openai.com/v1/chat/completions";
}
function llmAuthHeader() {
  if (PROVIDER === "deepseek") {
    const k = process.env.DEEPSEEK_API_KEY;
    if (!k) throw new Error("Missing DEEPSEEK_API_KEY");
    return `Bearer ${k}`;
  }
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("Missing OPENAI_API_KEY");
  return `Bearer ${k}`;
}

/** ---------- Tool handlers (call your existing APIs) ---------- */
async function tool_lookupSymbol(args: { query: string }) {
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/lookup/${encodeURIComponent(args.query)}`, { cache: "no-store" });
  return r.json();
}
async function tool_getFilings(args: { cikOrSymbol: string }) {
  // accept CIK or ticker/company; we try lookup then filings
  let cik = args.cikOrSymbol;
  if (!/^\d{10}$/.test(cik)) {
    const looked = await tool_lookupSymbol({ query: cik });
    cik = looked?.cik || cik;
  }
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/filings/${encodeURIComponent(cik)}`, { cache: "no-store" });
  return r.json();
}
async function tool_blsSeries(args: { ids: string; start?: string; end?: string; freq?: "monthly"|"annual" }) {
  const qs = new URLSearchParams({ ids: args.ids });
  if (args.start) qs.set("start", args.start);
  if (args.end) qs.set("end", args.end);
  if (args.freq) qs.set("freq", args.freq);
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/bls/series?${qs.toString()}`, { cache: "no-store" });
  return r.json();
}
async function tool_fredSeries(args: { id: string; start?: string; end?: string }) {
  const qs = new URLSearchParams({ id: args.id });
  if (args.start) qs.set("start", args.start);
  if (args.end) qs.set("end", args.end);
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/fred/series?${qs.toString()}`, { cache: "no-store" });
  return r.json();
}
async function tool_beaRealGDP(args: { lastN?: number }) {
  // Uses your /api/bea/query; returns timeseries of Real GDP (Quarterly)
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/bea/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      dataset: "NIPA",
      params: { TableName: "T10106", LineNumber: "1", Frequency: "Q", Year: "ALL" },
    }),
  });
  const j = await r.json();
  // Normalize to {type:"timeseries", title, points: [{date,value}]}
  return {
    type: "timeseries",
    title: "Real GDP (Chained $), Quarterly",
    points: (j?.data ?? []).map((d: any) => ({ date: d.date, value: Number(d.value) })).filter((p: any) => Number.isFinite(p.value)),
  };
}

/** ---------- Tool schema (for the LLM) ---------- */
const tools = [
  {
    type: "function",
    function: {
      name: "lookupSymbol",
      description: "Resolve a ticker or company name to a CIK and metadata.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "getFilings",
      description: "Fetch recent filings for a given CIK or symbol.",
      parameters: { type: "object", properties: { cikOrSymbol: { type: "string" } }, required: ["cikOrSymbol"] },
    },
  },
  {
    type: "function",
    function: {
      name: "blsSeries",
      description: "Fetch BLS time series by IDs (comma-separated).",
      parameters: {
        type: "object",
        properties: {
          ids: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          freq: { type: "string", enum: ["monthly", "annual"] },
        },
        required: ["ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fredSeries",
      description: "Fetch a FRED time series by series ID.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" }, start: { type: "string" }, end: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "beaRealGDP",
      description: "Return Real GDP series (quarterly).",
      parameters: { type: "object", properties: { lastN: { type: "number" } } },
    },
  },
];

/** ---------- System prompt ---------- */
const SYSTEM = `
You are Herevna's AI assistant.
- You can call tools to fetch EDGAR filings, BLS, FRED, and BEA data.
- When a user asks for a chart, respond with JSON:
  {"type":"timeseries","title":"Title","points":[{"date":"YYYY-MM-DD","value":123.4}]}
- Otherwise, answer briefly in plain text. If you used data, cite the source in plain text ("Source: SEC", "Source: BLS", etc.).
- If the user gives a ticker or company, resolve it with lookupSymbol first (supports AAPL, BRK.B, APPLE, etc.).
- If the user asks for "latest unemployment", BLS series LNS14000000 (monthly) is typical.
- For CPI headline (SA): CUUR0000SA0 from BLS.
- For Real GDP: use beaRealGDP.
`;

/** ---------- LLM call (function/tool calling) ---------- */
async function callLLM(messages: any[]) {
  const r = await fetch(llmEndpoint(), {
    method: "POST",
    headers: {
      "Authorization": llmAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`LLM error ${r.status}: ${txt}`);
  }
  return r.json();
}

/** ---------- Orchestrator ---------- */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userContent = String(body?.message || "").slice(0, 4000); // guard
    if (!userContent) return NextResponse.json({ error: "message required" }, { status: 400 });

    const msgs = [
      { role: "system", content: SYSTEM },
      { role: "user", content: userContent },
    ];

    // 1st LLM call
    const first = await callLLM(msgs);
    const choice = first.choices?.[0]?.message;
    const call = choice?.tool_calls?.[0];

    if (!call) {
      // plain text answer
      return NextResponse.json({ type: "text", content: choice?.content || "…" });
    }

    // Tool dispatch (single call; can be extended to loop if needed)
    const name = call.function?.name;
    const args = JSON.parse(call.function?.arguments || "{}");

    let toolResult: any = null;
    if (name === "lookupSymbol") toolResult = await tool_lookupSymbol(args);
    else if (name === "getFilings") toolResult = await tool_getFilings(args);
    else if (name === "blsSeries") toolResult = await tool_blsSeries(args);
    else if (name === "fredSeries") toolResult = await tool_fredSeries(args);
    else if (name === "beaRealGDP") toolResult = await tool_beaRealGDP(args);
    else toolResult = { error: `Unknown tool: ${name}` };

    // 2nd LLM call with tool result
    const second = await callLLM([
      ...msgs,
      choice,
      { role: "tool", tool_call_id: call.id, name, content: JSON.stringify(toolResult).slice(0, 15000) },
    ]);

    const finalMsg = second.choices?.[0]?.message?.content;
    // If model sends structured JSON for a chart, try to parse
    try {
      const parsed = JSON.parse(finalMsg || "");
      if (parsed?.type === "timeseries" && Array.isArray(parsed.points)) {
        return NextResponse.json(parsed);
      }
    } catch (_) {}

    return NextResponse.json({ type: "text", content: finalMsg || "Done." });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

