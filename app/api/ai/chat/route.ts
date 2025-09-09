import { NextRequest, NextResponse } from "next/server";

const DS_ENDPOINT =
  process.env.DEEPSEEK_API_BASE?.replace(/\/+$/, "") ||
  "https://api.deepseek.com";
const DS_API_KEY = process.env.DEEPSEEK_API_KEY;

// --------- small helpers ----------
function json(data: any, init?: number | ResponseInit) {
  return NextResponse.json(data, init);
}
function err(message: string, status = 400) {
  return json({ error: message }, { status });
}

type BLSPoint = { periodName: string; year: string; value: string };
type BLSSeries = { seriesID: string; data: BLSPoint[] };
type BLSResp = { Results?: { series?: BLSSeries[] } };

// fetch a single BLS series with latest=true
async function blsLatest(seriesId: string): Promise<BLSPoint | null> {
  const url = `https://api.bls.gov/publicAPI/v2/timeseries/data/${seriesId}?latest=true`;
  const r = await fetch(url, { next: { revalidate: 0 } });
  if (!r.ok) return null;
  const j = (await r.json()) as BLSResp;
  const s = j?.Results?.series?.[0];
  const p = s?.data?.[0];
  return p || null;
}

// fetch two most recent points for a series to compute m/m change
async function blsTwoLatest(seriesId: string): Promise<[BLSPoint, BLSPoint] | null> {
  const url = `https://api.bls.gov/publicAPI/v2/timeseries/data/${seriesId}?latest=true`;
  const r = await fetch(url, { next: { revalidate: 0 } });
  if (!r.ok) return null;
  const j = (await r.json()) as BLSResp;
  const s = j?.Results?.series?.[0];
  const arr = s?.data || [];
  if (arr.length < 2) return null;
  return [arr[0], arr[1]];
}

function monthStamp(p: BLSPoint) {
  return `${p.periodName} ${p.year}`; // e.g., "August 2025"
}

function isUnemploymentPrompt(q: string) {
  const t = q.toLowerCase();
  return (
    t.includes("unemployment") ||
    t.includes("employment situation") ||
    t.includes("jobs report") ||
    t.includes("nonfarm payroll") ||
    t.includes("nfp")
  );
}

// Build the live snapshot answer (no LLM)
async function unemploymentAnswer() {
  // Unemployment rate (LNS14000000)
  const unrate = await blsLatest("LNS14000000");
  // Total nonfarm payrolls level (CES0000000001)
  const payemsTwo = await blsTwoLatest("CES0000000001");

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
    payrollLine = ` • Nonfarm payrolls: ${changeFmt} (m/m)`;
  }

  const rate = Number(unrate.value).toFixed(1);
  const stamp = monthStamp(unrate);
  const link = "https://www.bls.gov/news.release/empsit.nr0.htm";

  return {
    text: `**Latest Employment Situation (BLS)** — ${stamp}
**Unemployment rate:** ${rate}%${payrollLine ? "\n" + payrollLine : ""}
Full report: ${link}`,
  };
}

// ------------------ main handler ------------------
export async function POST(req: NextRequest) {
  try {
    const { messages } = (await req.json()) as {
      messages: { role: "system" | "user" | "assistant"; content: string }[];
    };
    if (!messages || !messages.length) return err("No messages", 400);

    // look at the latest user utterance
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUser?.content || "";

    // Intercept time-sensitive econ questions and fetch LIVE data
    if (isUnemploymentPrompt(userText)) {
      const ans = await unemploymentAnswer();
      return json({ choices: [{ message: { role: "assistant", content: ans.text } }] });
    }

    // Otherwise, call DeepSeek (regular chat)
    if (!DS_API_KEY) return err("Missing DEEPSEEK_API_KEY", 500);

    const sysPreamble =
      "You are Herevna AI. For **time-sensitive economic/market data** (BLS, CPI, jobs report, EDGAR latest filings, FRED series, BEA releases), NEVER rely on memory: tell the user you’re fetching live data and require a server fetch or a provided tool. Keep answers concise and include direct source links.";

    const body = {
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [
        { role: "system", content: sysPreamble },
        ...messages, // we still forward history
      ],
      temperature: 0.2,
      stream: false,
    };

    const r = await fetch(`${DS_ENDPOINT}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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