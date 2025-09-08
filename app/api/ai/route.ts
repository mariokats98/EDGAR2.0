// app/api/ai/chat/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ensure Node (not edge)

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing DEEPSEEK_API_KEY env var." },
        { status: 500 }
      );
    }

    // DeepSeek OpenAI-compatible endpoint
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat", // or "deepseek-reasoner" if you’re using that tier
        messages: [
          {
            role: "system",
            content:
              "You are Herevna's assistant. Be concise. When mentioning EDGAR/BLS items, respond with short bullet points and proper links (not raw HTML). If a user asks for downloadable items, include direct links.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return NextResponse.json(
        { error: `DeepSeek error ${r.status}: ${text.slice(0, 500)}` },
        { status: 502 }
      );
    }

    const data = await r.json();
    const message =
      data?.choices?.[0]?.message?.content ??
      "Sorry, I couldn’t generate a reply.";

    return NextResponse.json({ message });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}
