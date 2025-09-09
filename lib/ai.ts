// lib/ai.ts
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat"; // adjust if you use r1 or others

export async function deepseekChat(messages: ChatMessage[], temperature = 0.2): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("Missing DEEPSEEK_API_KEY");

  const r = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      stream: false,
    }),
  });

  if (!r.ok) {
    let body = await r.text().catch(() => "");
    throw new Error(`DeepSeek error ${r.status}: ${body}`);
  }

  const j = await r.json();
  // OpenAI-compatible response shape
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error("DeepSeek empty response");
  return text.trim();
}