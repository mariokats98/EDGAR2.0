// app/api/chat/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json(
        { error: "Missing DEEPSEEK_API_KEY env var." },
        { status: 500 }
      );
    }

    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat", // main DeepSeek chat model
        messages: [
          {
            role: "system",
            content:
              "You are an assistant specialized in EDGAR filings, BLS data, BEA data, and FRED benchmarks. Always explain in simple, clear terms and provide charts when possible.",
          },
          { role: "user", content: message },
        ],
        stream: false, // set to true if you want streaming responses
      }),
    });

    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content ?? "No response.";
    return NextResponse.json({ reply });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Something went wrong." },
      { status: 500 }
    );
  }
}

