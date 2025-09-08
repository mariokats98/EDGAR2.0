// app/api/chat/route.ts
import { NextResponse } from "next/server";

const BASE_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const system = [
      "You are Herevna’s assistant. Be concise and ACTIONABLE.",
      "When the user asks for filings, economic prints, or documents:",
      "- Prefer SHORT output with direct LINKS the user can click to open/download.",
      "- For SEC filings, include direct EDGAR URLs when possible (company submissions, accession/primary_doc).",
      "- For BLS/BEA/FRED series or releases, include the official source link.",
      "- If you reference data from this site’s APIs, also show the source link the user can open.",
      "If the request needs time, start your reply with: 'Thinking…' and then proceed with links.",
      "If no links are available, say 'No link available' explicitly.",
    ].join("\n");

    const r = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: String(message || "") },
        ],
        temperature: 0.2,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return NextResponse.json({ error: `DeepSeek error: ${err}` }, { status: 500 });
    }

    const data = await r.json();
    const reply =
      data?.choices?.[0]?.message?.content ??
      "No response.";

    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
