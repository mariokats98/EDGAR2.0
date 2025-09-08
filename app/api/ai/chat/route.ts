// app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

function baseUrl(req: NextRequest) {
  const envBase = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (envBase) return envBase;
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

async function jsonGet(url: string) {
  const r = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!r.ok) {
    let msg = `fetch failed (${r.status})`;
    try {
      const j = await r.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

function wantEdgar(q: string) {
  return /\b(edgar|sec|10-k|10q|10-q|8-k|s-1|13d|13g|6-k|latest filing|filing)\b/i.test(q);
}
function wantBls(q: string) {
  return /\b(cpi|unemployment|payroll|payrolls|bls|average hourly earnings|ahe|productivity)\b/i.test(q);
}

async function toolEdgar(base: string, query: string) {
  // 1) Try symbol/company → CIK
  const q = query.trim();
  const sym = q.split(/\s+/)[0].replace(/[^A-Za-z0-9\.\-]/g, ""); // crude first token
  let cik = "";

  // try /api/lookup (symbol or name)
  try {
    const lk = await jsonGet(`${base}/api/lookup/${encodeURIComponent(sym)}`);
    if (lk?.cik) cik = lk.cik;
  } catch {}

  if (!cik && /\d{10}/.test(q)) {
    cik = q.match(/\d{10}/)![0];
  }
  if (!cik) throw new Error("I couldn’t resolve that company to a CIK.");

  // 2) Fetch filings
  const filings = await jsonGet(`${base}/api/filings/${encodeURIComponent(cik)}`);

  // pick the most recent few
  const top = (Array.isArray(filings) ? filings : []).slice(0, 5);

  const links = top.map((f: any) => {
    const label = `${f.form} — ${f.company} (${f.filed_at})`;
    const url =
      f.primary_doc_url ||
      f.source_url ||
      `https://www.sec.gov/Archives/edgar/data/${f.cik}/${f.accession || ""}`;
    return { label, url };
  });

  const summary =
    top.length > 0
      ? `Found ${top.length} recent filings for ${top[0]?.company || "the company"}.`
      : "No recent filings found.";

  return { summary, links };
}

async function toolBls(base: string, query: string) {
  // simple mapping for most common requests
  const map: Record<string, string> = {
    cpi: "CUUR0000SA0",
    unemployment: "LNS14000000",
    unrate: "LNS14000000",
    payrolls: "CES0000000001",
    "average hourly earnings": "CES0500000003",
    ahe: "CES0500000003",
    productivity: "PRS85006093",
  };
  const lower = query.toLowerCase();
  let id = "";
  for (const [k, v] of Object.entries(map)) {
    if (lower.includes(k)) {
      id = v;
      break;
    }
  }
  if (!id) id = "CUUR0000SA0"; // default CPI

  const thisYear = new Date().getFullYear().toString();
  const qs = new URLSearchParams({ ids: id, start: "2018", end: thisYear, freq: "monthly" }).toString();
  const data = await jsonGet(`${base}/api/bls/series?${qs}`);

  const s = Array.isArray(data?.data) ? data.data[0] : null;
  const latest = s?.latest;
  const links = [] as { label: string; url: string }[];

  // If we have a known series, add BLS public series finder link
  links.push({
    label: "Open in BLS Series Finder",
    url: `https://beta.bls.gov/dataViewer/view/timeseries/${encodeURIComponent(id)}`,
  });

  const summary = latest
    ? `Latest ${id} is ${latest.value} on ${latest.date}.`
    : "No recent value found.";

  return { summary, links };
}

async function deepseekAnswer(system: string, content: string) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    // If no key, just return the system + content fallback
    return `(${system})\n\n${content}`;
  }
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      temperature: 0.2,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "DeepSeek error");
  return j?.choices?.[0]?.message?.content || "I couldn’t generate a reply.";
}

export async function POST(req: NextRequest) {
  try {
    const { messages = [] } = await req.json();
    const last: string = messages?.[messages.length - 1]?.content || "";
    const base = baseUrl(req);

    // Show “thinking” on the client side — we just return when done.

    // 1) Tooling fast path
    let toolSummary = "";
    let toolLinks: { label: string; url: string }[] = [];

    if (wantEdgar(last)) {
      try {
        const { summary, links } = await toolEdgar(base, last);
        toolSummary = summary;
        toolLinks = links;
      } catch (e: any) {
        toolSummary = `EDGAR lookup failed: ${e?.message || "error"}`;
      }
    } else if (wantBls(last)) {
      try {
        const { summary, links } = await toolBls(base, last);
        toolSummary = summary;
        toolLinks = links;
      } catch (e: any) {
        toolSummary = `BLS lookup failed: ${e?.message || "error"}`;
      }
    }

    // 2) Compose a neat, minimal prompt for DeepSeek using the tool outputs
    const sys =
      "You are a precise financial data assistant. If links are provided, reference them. Be concise, factual, and avoid speculation.";
    const userPrompt =
      (toolSummary ? `${toolSummary}\n\n` : "") +
      (toolLinks.length
        ? `Links:\n${toolLinks.map(l => `• ${l.label}: ${l.url}`).join("\n")}\n\n`
        : "") +
      `User question: ${last}`;

    const text = await deepseekAnswer(sys, userPrompt);

    return NextResponse.json({
      text,
      links: toolLinks, // the UI will render these as downloadable links
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
