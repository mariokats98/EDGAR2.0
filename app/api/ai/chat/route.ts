// app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

const DS_BASE =
  (process.env.DEEPSEEK_API_BASE?.replace(/\/+$/, "") as string) ||
  "https://api.deepseek.com";
const DS_API_KEY = process.env.DEEPSEEK_API_KEY;
const DS_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

// ---------- helpers ----------
function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return json({ error: message }, { status });
}
type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

// ---------- tiny BLS live intercept (works for “latest unemployment …”) ----------
type BLSPoint = { periodName: string; year: string; value: string };
type BLSSeries = { seriesID: string; data: BLSPoint[] };
type BLSResp = { Results?: { series?: BLSSeries[] } };

async function blsFetch(seriesId: string) {
  const r = await fetch(
    `https://api.bls.gov/publicAPI/v2/timeseries/data/${seriesId}?latest=true`,
    { cache: "no-store", next: { revalidate: 0 } }
  );
  if (!r.ok) return null;
  const j = (await r.json()) as BLSResp;
  return j?.Results?.series?.[0]?.data ?? null;
}
function isUnempPrompt(t: string) {
  t = t.toLowerCase();
  return (
    t.includes("unemployment") ||
    t.includes("employment situation") ||
    t.includes("jobs report") ||
    t.includes("nonfarm payroll") ||
    t.includes("nfp") ||
    t.includes("jobless rate")
  );
}
function monthStamp(p: BLSPoint) {
  return `${p.periodName} ${p.year}`;
}
async function unemploymentAnswer() {
  const rateArr = await blsFetch("LNS14000000");
  const nfpArr = await blsFetch("CES0000000001");
  if (!rateArr?.[0]) {
    return "**I tried to fetch the latest BLS unemployment rate but couldn’t reach the API just now.** Try again in a moment.";
  }
  const r = rateArr[0];
  const rate = Number(r.value).toFixed(1);
  let nfpLine = "";
  if (nfpArr?.length >= 2) {
    const latest = Number(nfpArr[0].value.replace(/,/g, ""));
    const prev = Number(nfpArr[1].value.replace(/,/g, ""));
    const ch = latest - prev;
    nfpLine =
      `\n**Nonfarm payrolls (m/m):** ` +
      `${ch >= 0 ? "+" : "−"}${Math.abs(ch).toLocaleString()}k`;
  }
  return `**Latest Employment Situation (BLS) — ${monthStamp(r)}**\n` +
    `**Unemployment rate:** ${rate}%${nfpLine}\n` +
    `Full report: https://www.bls.gov/news.release/empsit.nr0.htm`;
}

// ---------- DeepSeek call (normalized output) ----------
async function deepseekChat(messages: ChatMsg[]) {
  if (!DS_API_KEY) throw new Error("Missing DEEPSEEK_API_KEY");

  const sys =
    "You are Herevna AI. Stay strictly on finance/econ/stocks/filings. " +
    "For time-sensitive data (BLS, CPI, EDGAR latest filings, FRED, BEA), prefer live APIs and return direct source links.";

  const payload = {
    model: DS_MODEL,
    messages: [{ role: "system", content: sys }, ...messages],
    temperature: 0.2,
    stream: false,
  };

  const r = await fetch(`${DS_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    next: { revalidate: 0 },
  });

  const bodyText = await r.text();
  let ds: any = {};
  try {
    ds = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    throw new Error(`DeepSeek returned non-JSON (${r.status})`);
  }
  if (!r.ok || ds.error) {
    const msg = ds?.error?.message || bodyText || "DeepSeek error";
    throw new Error(`DeepSeek request failed (${r.status}) ${msg}`);
  }

  // Normalize across possible provider variants
  const content =
    ds?.choices?.[0]?.message?.content ??
    ds?.choices?.[0]?.text ??
    ds?.output_text ??
    (Array.isArray(ds?.content)
      ? ds.content.map((c: any) => c?.text).filter(Boolean).join("\n")
      : "");

  if (!content) throw new Error("Empty response from model");

  // Always return a stable shape for the UI
  return { choices: [{ message: { role: "assistant", content } }] };
}

// ---------- main handler ----------
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => ({}));
    // Accept either {messages:[...]} OR {prompt:"..."}
    let messages: ChatMsg[] | undefined = raw?.messages;
    if (!messages && typeof raw?.prompt === "string") {
      messages = [{ role: "user", content: raw.prompt }];
    }
    if (!messages?.length) return err("No messages", 400);

    const userText =
      [...messages].reverse().find((m) => m.role === "user")?.content || "";

    // Live intercept: unemployment
    if (isUnempPrompt(userText)) {
      const text = await unemploymentAnswer();
      return json({ choices: [{ message: { role: "assistant", content: text } }] });
    }

    // Default: model
    const normalized = await deepseekChat(messages);
    return json(normalized);
  } catch (e: any) {
    return err(e?.message || "Unexpected server error", 500);
  }
}