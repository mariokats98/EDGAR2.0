// app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

const SITE = (req: NextRequest) =>
  (process.env.NEXT_PUBLIC_SITE_URL || `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("host")}`).replace(/\/+$/, "");

async function jget(url: string) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!r.ok) {
    let msg = `fetch failed (${r.status})`;
    try { const j = await r.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

function looksLikeEdgar(q: string) {
  return /\b(edgar|sec|10-k|10q|10-q|8-k|s-1|13d|13g|6-k|latest filing|filing)\b/i.test(q);
}

async function resolveCIK(base: string, query: string) {
  // try first token as ticker, else full name
  const token = query.trim().split(/\s+/)[0];
  const tryList = [token, query.trim()];
  let lastErr = "";
  for (const t of tryList) {
    try {
      const lk = await jget(`${base}/api/lookup/${encodeURIComponent(t)}`);
      if (lk?.cik) return lk;
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
  }
  throw new Error(lastErr || "Unable to resolve to CIK.");
}

async function getRecentFilings(base: string, cik: string) {
  const arr = await jget(`${base}/api/filings/${encodeURIComponent(cik)}`);
  return Array.isArray(arr) ? arr : [];
}

async function deepseek(text: string) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return text;
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Only answer from provided facts/links. If you don't have facts, ask me to clarify ticker, company, or date range. Be concise." },
        { role: "user", content: text },
      ],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "DeepSeek error");
  return j?.choices?.[0]?.message?.content || text;
}

export async function POST(req: NextRequest) {
  try {
    const { messages = [] } = await req.json();
    const q = messages?.[messages.length - 1]?.content || "";
    const base = SITE(req);

    let links: { label: string; url: string }[] = [];
    let preface = "";

    if (looksLikeEdgar(q)) {
      try {
        // 1) Resolve to CIK (works for ANY ticker/company, e.g., NVDA or NVIDIA)
        const { cik, ticker, name } = await resolveCIK(base, q);
        // 2) Fetch filings
        const filings = await getRecentFilings(base, cik);
        if (filings.length) {
          preface = `Latest filings for ${name || ticker || cik}:`;
          links = filings.slice(0, 5).map((f: any) => ({
            label: `${f.form} • ${f.filed_at}`,
            url: f.index_url || f.primary_doc_url,
          }));
        } else {
          preface = `No recent filings found for ${name || ticker || cik}.`;
        }
      } catch (e: any) {
        preface = `EDGAR lookup failed: ${e?.message || "error"}. Try a known ticker (e.g., NVDA) or exact company name.`;
      }
    }

    const prompt =
      (preface ? `${preface}\n` : "") +
      (links.length ? `Links:\n${links.map((l) => `• ${l.label}: ${l.url}`).join("\n")}\n\n` : "") +
      `User: ${q}`;

    const text = await deepseek(prompt);

    return NextResponse.json({ text, links });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
