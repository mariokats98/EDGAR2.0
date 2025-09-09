// app/api/ai/chat/route.ts
export const runtime = "edge";

type ChatRequest = {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
};

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT || "herevna.ai contact@yourdomain.com";

function json(data: any, init?: number | ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: typeof init === "number" ? init : init?.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(typeof init === "object" ? init.headers : {}),
    },
  });
}

// ---------- EDGAR intent helpers ----------
const FORM_ALIASES = [
  "10-k","10k","10-q","10q","8-k","8k","6-k","6k","20-f","20f","40-f","40f",
  "s-1","s1","s-3","s3","s-4","s4","13f","def 14a","def14a"
] as const;

const FORM_MAP: Record<string, string> = {
  "10-k":"10-K","10k":"10-K","10-q":"10-Q","10q":"10-Q","8-k":"8-K","8k":"8-K",
  "6-k":"6-K","6k":"6-K","20-f":"20-F","20f":"20-F","40-f":"40-F","40f":"40-F",
  "s-1":"S-1","s1":"S-1","s-3":"S-3","s3":"S-3","s-4":"S-4","s4":"S-4",
  "13f":"13F-HR","def 14a":"DEF 14A","def14a":"DEF 14A",
};

function extractFormHints(text: string) {
  const lower = text.toLowerCase();
  const matched = FORM_ALIASES.filter(f => lower.includes(f));
  const forms = Array.from(new Set(matched.map(m => FORM_MAP[m] ?? m.toUpperCase())));
  const wantsLatest = /\b(latest|most recent|today)\b/i.test(text);
  return { forms, wantsLatest };
}

function extractTickerLike(text: string) {
  // crude but helpful; we still resolve via /api/lookup
  const m = text.toUpperCase().match(/\b[A-Z]{1,5}(\.[A-Z])?\b/);
  return m?.[0] || null;
}

function isEdgarIntent(text: string) {
  return /\b(edgar|filing|filings)\b/i.test(text) || extractFormHints(text).forms.length > 0;
}

function buildPrimaryHref(row: any) {
  if (row?.links?.primary) return row.links.primary as string;
  if (row?.download) return row.download as string;
  return row?.links?.indexHtml ?? "";
}

function formatFilingLine(r: any) {
  const href = buildPrimaryHref(r);
  const label = `${r.form} • ${r.filed}${r.company ? ` • ${r.company}` : ""}`;
  return `- [Open / Download](${href}) — ${label}  \n  Accession: \`${r.accessionNumber}\``;
}

// ---------- DeepSeek prompt ----------
const SYSTEM_PROMPT = `
You are Herevna AI — a finance/econ assistant.

HARD RULES:
- Never mention training cutoffs or say your knowledge is outdated.
- For filings, tickers, econ data: prefer using the site's live APIs (EDGAR/BLS/FRED/BEA/Census) and summarize results.
- Provide concise answers. For filings, always include a direct "Open / Download" link.
- If a request is ambiguous, ask one clarifying question.
`.trim();

export async function POST(req: Request) {
  // Use the current request origin (works in Vercel preview/prod AND local dev)
  const ORIGIN = new URL(req.url).origin;

  async function resolveCIK(input: string) {
    const url = `${ORIGIN}/api/lookup/${encodeURIComponent(input)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`lookup failed (${r.status})`);
    const j = await r.json();
    if (!j) return null;
    if (j.kind === "cik") return j.value as string;
    return j.cik || null;
  }

  async function fetchFilings(cik: string, forms: string[] | null) {
    const params = new URLSearchParams({
      start: "2000-01-01",
      end: new Date().toISOString().slice(0,10),
      perPage: "25",
      page: "1",
    });
    if (forms && forms.length) params.set("forms", forms.join(","));
    const url = `${ORIGIN}/api/filings/${encodeURIComponent(cik)}?${params}`;
    const r = await fetch(url, { cache: "no-store", headers: { "x-sec-ua": SEC_USER_AGENT } });
    if (!r.ok) throw new Error(`filings failed (${r.status})`);
    const j = await r.json();
    if (j?.ok === false) throw new Error(`filings returned ok=false`);
    return j as { ok: boolean; total: number; data: any[] };
  }

  try {
    const body = (await req.json()) as ChatRequest;
    const userMsg = body?.messages?.slice().reverse().find(m => m.role === "user")?.content || "";

    // 1) Prefer EDGAR live flow when it looks like a filings question
    if (isEdgarIntent(userMsg)) {
      const { forms, wantsLatest } = extractFormHints(userMsg);
      const candidate = extractTickerLike(userMsg) || userMsg;

      let cik: string | null = null;
      try {
        cik = await resolveCIK(candidate);
      } catch (e: any) {
        return json({ role: "assistant", content: `I couldn’t resolve that company/ticker (lookup error). Try a ticker like **NVDA** or paste a 10-digit CIK.` });
      }
      if (!cik) {
        return json({ role: "assistant", content: `I couldn’t find that entity. Try the exact ticker (e.g., **NVDA**) or a 10-digit CIK.` });
      }

      let filings;
      try {
        filings = await fetchFilings(cik, forms.length ? forms : null);
      } catch (e: any) {
        return json({ role: "assistant", content: `I couldn’t fetch filings for that company (server said ${e?.message || "error"}). Try again in a moment.` }, 502);
      }

      if (!filings?.data?.length) {
        return json({ role: "assistant", content: `No matching filings. Try removing the form filter or widening the date range.` });
      }

      const list = wantsLatest ? filings.data.slice(0,1) : filings.data.slice(0,5);
      const lines = list.map(formatFilingLine).join("\n");
      const header =
        wantsLatest && list[0]
          ? `**Latest ${list[0].form} for ${list[0].company ?? list[0].cik}**`
          : `**Recent filings (${list.length}/${filings.total})**`;

      return json({ role: "assistant", content: `${header}\n\n${lines}` });
    }

    // 2) Everything else → DeepSeek (but no “stale knowledge” talk)
    if (!DEEPSEEK_API_KEY) {
      return json({ role: "assistant", content: "AI is unavailable (missing DEEPSEEK_API_KEY). You can still ask me for EDGAR filings by ticker/CIK." }, 500);
    }

    const dsRes = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...(body?.messages || []).filter(m => m.role !== "system"),
        ],
      }),
    });

    if (!dsRes.ok) {
      const text = await dsRes.text().catch(() => "");
      return json({ role: "assistant", content: `AI request failed (${dsRes.status}). ${text.slice(0,200)}` }, 502);
    }

    const out = await dsRes.json();
    const content = out?.choices?.[0]?.message?.content || "I couldn’t generate a reply. Please try again.";
    return json({ role: "assistant", content });

  } catch (e: any) {
    return json({ role: "assistant", content: `Unexpected error: ${e?.message || "unknown"}` }, 500);
  }
}