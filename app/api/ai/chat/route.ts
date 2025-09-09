// app/api/ai/chat/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // avoid Edge quirks for now

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `
You are Herevna AI — a finance-only assistant.
Answer ONLY questions about markets, companies, filings (EDGAR), macro (BLS, FRED, BEA, Census), or investing.
If a user asks for a filing, prefer returning a clean, clickable SEC link.
Be concise. If you’re unsure, say what you can fetch (and from where).
`;

function bad(status: number, msg: string, details?: any) {
  return NextResponse.json({ ok: false, error: msg, details }, { status });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "AI chat is alive" });
}

export async function POST(req: Request) {
  try {
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
      return bad(500, "Missing DEEPSEEK_API_KEY env var");
    }

    let body: { messages?: ChatMessage[] } = {};
    try {
      body = await req.json();
    } catch {
      return bad(400, "Invalid JSON body");
    }

    const userMessages = body.messages ?? [];
    if (!Array.isArray(userMessages) || userMessages.length === 0) {
      return bad(400, "Provide messages[]");
    }

    // Prepend our guardrail system prompt
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...userMessages.map((m) => ({
        role: m.role,
        content: `${m.content}`.slice(0, 8000), // safety trim
      })),
    ];

    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.2,
        stream: false, // keep it simple/reliable first
        messages,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return bad(502, `LLM upstream error (${resp.status})`, text || undefined);
    }

    const data = await resp.json();
    const text: string =
      data?.choices?.[0]?.message?.content ??
      "Sorry—I couldn’t generate a reply.";

    return NextResponse.json({ ok: true, text });
  } catch (err: any) {
    return bad(500, "Unhandled server error", String(err?.message || err));
  }
}