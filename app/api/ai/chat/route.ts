// app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

const DS_ENDPOINT =
  (process.env.DEEPSEEK_API_BASE?.replace(/\/+$/, "") as string) ||
  "https://api.deepseek.com";
const DS_API_KEY = process.env.DEEPSEEK_API_KEY;

// ---------- small helpers (fixed typing) ----------
function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return json({ error: message }, { status });
}

// ---------- BLS helpers ----------
type BLSPoint = { periodName: string; year: string; value: string };
type BLSSeries = { seriesID: string; data: BLSPoint[] };
type BLSResp = { Results?: { series?: BLSSeries[] } };

async function blsLatest(seriesId: string): Promise<BLSPoint | null> {
  const url = `https://api.bls.gov/publicAPI/v2/timeseries/data/${seriesId}?latest=true`;
  const r = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });
  if (!r.ok) return null;
  const j = (await r.json()) as BLSResp;
  return j?.Results?.series?.[0]?.data?.[0] ?? null;
}

async function blsTwoLatest(seriesId: string): Promise<[BLSPoint, BLSPoint] | null> {
  const url = `https://api.bls.gov/publicAPI/v2/timeseries/data/${seriesId}?latest=true`;
  const r = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });
  if (!r.ok) return null;
  const j = (await r.json()) as BLSResp;
  const arr = j?.Results?.series?.[0]?.data ?? [];
  return arr.length >= 2 ? [arr[0], arr[1]] : null;
}

function monthStamp(p: BLSPoint) {
  return `${p.periodName} ${p.year}`; // e.g., "September 2025"
}

function isUnemploymentPrompt(q: string) {
  const t = q.toLowerCase();
  return (
    t.includes("unemployment") ||
    t.includes("employment situation") ||
    t.includes("jobs report") ||
    t.includes("nonfarm payroll") ||
    t.includes("nfp") ||
    t.includes("jobless rate")
  );
}

async function unemploymentAnswer() {
  const unrate = await blsLatest("LNS14000000");            // Unemployment rate
  const payemsTwo = await blsTwoLatest("CES0000000001");    // Nonfarm payrolls level

  if (!unrate) {
    return {
      text:
        "I tried to fetch the latest unemployment rate from BLS but couldn’t reach their API just now. Please try again in a moment.",
    };
  }

  let payrollLine = "";
  if (payemsTwo) {
    const [latest, prev] = payemsTwo;
    const latestVal = Number(latest.value.replace(/,/g, "")); // thousands
    const prevVal = Number(prev.value.replace(/,/g, ""));
    const change = latestVal - prevVal;
    const changeFmt =
      (change >= 0 ? "+" : "−") + Math.abs(change).toLocaleString() + "k";
    payrollLine = `\n**Nonfarm payrolls (m/m):** ${changeFmt}`;
  }

  const rate = Number(unrate.value).toFixed(1);
  const stamp = monthStamp(unrate);
  const link = "https://www.bls.gov/news.release/empsit.nr0.htm";

  return {
    text: `**Latest Employment Situation (BLS) — ${stamp}**\n**Unemployment rate:** ${rate}%${payrollLine}\nFull report: ${link}`,
  };
}

// ------------- main handler -------------
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      messages: { role: "system" | "user" | "assistant"; content: string }[];
    };
    const messages = body?.messages;
    if (!messages?.length) return err("No messages", 400);

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUser?.content ?? "";

    // Intercept time-sensitive econ questions → live BLS
    if (isUnemploymentPrompt(userText)) {
      const ans = await unemploymentAnswer();
      return json({
        choices: [{ message: { role: "assistant", content: ans.text } }],
      });
    }

    // Otherwise → DeepSeek chat
    if (!DS_API_KEY) return err("Missing DEEPSEEK_API_KEY", 500);

    const sysPreamble =
      "You are Herevna AI. For time-sensitive economic/market data (BLS, CPI, jobs report, EDGAR latest filings, FRED series, BEA releases), do not rely on static knowledge: fetch live data via the app's tools or say you are fetching live data. Keep answers concise and include direct source links when possible.";

    const payload = {
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [{ role: "system", content: sysPreamble }, ...messages],
      temperature: 0.2,
      stream: false,
    };

    const r = await fetch(`${DS_ENDPOINT}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      // no-store to avoid any stale proxies
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return err(`DeepSeek request failed (${r.status}) ${text || ""}`, r.status);
    }

    const j = await r.json();
    return json(j);
  } catch (e: any) {
    return err(e?.message || "Unexpected server error", 500);
  }
}