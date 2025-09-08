// app/api/ai/chat/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ensure Node runtime on Vercel
export const dynamic = "force-dynamic"; // avoid any caching weirdness

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res;
}

export async function OPTIONS() {
  // Handle preflight cleanly so the client never gets a 405 here
  return cors(new NextResponse(null, { status: 200 }));
}

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return cors(NextResponse.json({ error: "Missing prompt" }, { status: 400 }));
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return cors(
        NextResponse.json({ error: "Missing DEEPSEEK_API_KEY env var." }, { status: 500 })
      );
    }

    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat", // change to "deepseek-reasoner" if you use that
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are Herevna's assistant. Be concise. When the user asks for EDGAR/BLS/BEA items, include short bullet points and direct, clickable download links. If generating summaries, keep them tight.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return cors(
        NextResponse.json(
          { error: `DeepSeek error ${r.status}: ${text.slice(0, 400)}` },
          { status: 502 }
        )
      );
    }

    const data = await r.json();
    const message =
      data?.choices?.[0]?.message?.content ?? "Sorry, I couldn’t generate a reply.";

    return cors(NextResponse.json({ message }, { status: 200 }));
  } catch (e: any) {
    return cors(
      NextResponse.json({ error: e?.message || "Unexpected server error" }, { status: 500 })
    );
  }
}

