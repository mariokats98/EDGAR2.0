// app/api/ai/chat/route.ts
export const runtime = "edge";

type ChatRequest = {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
};

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
  // Fallback for local dev; prod should set NEXT_PUBLIC_SITE_URL to your domain
  "http://localhost:3000";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY; // set in Vercel
const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ||
  "herevna.ai contact@yourdomain.com"; // keep your existing UA (must be valid email/domain)

function json(data: any, init?: number | ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: typeof init === "number" ? init : init?.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(typeof init === "object" ? init.headers : {}),
    },
  });
}

// --- Quick heuristics to decide if the user asked for filings ---
const FORM_ALIASES = [
  "10-k",
  "10k",
  "10-q",
  "10q",
  "8-k",
  "8k",
  "6-k",
  "6k",
  "20-f",
  "20f",
  "40-f",
  "40f",
  "s-1",
  "s1",
  "s-3",
  "s3",
  "s-4",
  "s4",
  "13f",
  "def 14a",
  "def14a",
] as const;

function extractFormHints(text: string) {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const f of FORM_ALIASES) {
    if (lower.includes(f)) matched.push(f);
  }
  // Normalize to EDGAR canonical forms where possible
  const map: Record<string, string> = {
    "10-k": "10-K",
    "10k": "10-K",
    "10-q": "10-Q",
    "10q": "10-Q",
    "8-k": "8-K",
    "8k": "8-K",
    "6-k": "6-K",
    "6k": "6-K",
    "20-f": "20-F",
    "20f": "20-F",
    "40-f": "40-F",
    "40f": "40-F",
    "s-1": "S-1",
    "s1": "S-1",
    "s-3": "S-3",
    "s3": "S-3",
    "s-4": "S-4",
    "s4": "S-4",
    "13f": "13F-HR",
    "def 14a": "DEF 14A",
    "def14a": "DEF 14A",
  };
  const forms = matched.map((m) => map[m] ?? m.toUpperCase());
  // If user said "latest filing" / "most recent", keep empty and we’ll pick most recent any-form
  const wantsLatest =
    /\blatest\b|\bmost recent\b|\brecent\b|\btoday\b/i.test(text);
  return { forms: Array.from(new Set(forms)), wantsLatest };
}

function extractSymbolish(text: string) {
  // Try to pull a likely ticker (simple heuristic). We still resolve through /api/lookup
  // e.g. "NVDA 10-K", "get AAPL 10q", "latest for AMD"
  const m = text.toUpperCase().match(/\b[A-Z]{1,5}(\.[A-Z])?\b/);
  return m?.[0] || null;
}

// Build “primary document” link from API row
function buildPrimaryHref(row: any) {
  // our /api/filings route already returns proper URLs in row.links.primary
  if (row?.links?.primary) return row.links.primary as string;
  // Fallbacks if shape differs
  if (row?.download) return row.download as string;
  return row?.links?.indexHtml ?? "";
}

// Format one filing line
function formatFilingLine(r: any) {
  const href = buildPrimaryHref(r);
  const label = `${r.form} • ${r.filed}${
    r.company ? ` • ${r.company}` : ""
  }`;
  return `- [Open / Download](${href}) — ${label}  \n  Accession: \`${r.accessionNumber}\``;
}

// Call your internal lookup → resolves ticker/company/CIK to CIK
async function resolveCIK(input: string) {
  const url = `${SITE}/api/lookup/${encodeURIComponent(input)}`;
  const r = await fetch(url, {
    headers: { "x-sec-user-agent": SEC_USER_AGENT },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = (await r.json()) as
    | { kind: "cik"; value: string }
    | { kind: "symbol"; value: string; cik: string }
    | { kind: "name"; value: string; cik: string }
    | null;
  if (!j) return null;
  if (j.kind === "cik") return j.value;
  return (j as any).cik || null;
}

// Fetch filings from your internal API
async function fetchFilings(cik: string, forms: string[] | null) {
  const params = new URLSearchParams({
    start: "2000-01-01",
    end: new Date().toISOString().slice(0, 10),
    perPage: "25",
    page: "1",
  });
  if (forms && forms.length) params.set("forms", forms.join(","));
  const url = `${SITE}/api/filings/${encodeURIComponent(cik)}?${params}`;
  const r = await fetch(url, {
    headers: { "x-sec-user-agent": SEC_USER_AGENT },
    cache: "no-store",
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(
      `Filings fetch failed (${r.status}) ${text?.slice(0, 200)}`.trim()
    );
  }
  const j = (await r.json()) as {
    ok: boolean;
    total: number;
    data: any[];
  };
  if (j?.ok === false) throw new Error("Filings fetch failed");
  return j;
}

// Decide if the user asked for filings/EDGAR type task
function isEdgarIntent(text: string) {
  return (
    /\bedgar\b/i.test(text) ||
    /\bfiling(s)?\b/i.test(text) ||
    extractFormHints(text).forms.length > 0
  );
}

const SYSTEM_PROMPT = `
You are Herevna AI — a finance/econ assistant.
HARD RULES:
- Do NOT mention training cutoffs or that you "don't have up-to-date knowledge".
- When asked for filings, tickers, economics, or market data, prefer calling the site's APIs (EDGAR/BLS/FRED/BEA/Census through provided endpoints) and summarize live results.
- Provide clean, concise answers. For filings, always include direct "Open / Download" links returned from the API. 
- If a request is ambiguous, ask one targeted clarifying question.
- If something isn't available, explain briefly and provide the next best action.
`.trim();

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequest;
    const userMsg =
      body?.messages?.slice().reverse().find((m) => m.role === "user")
        ?.content || "";

    // 1) Try EDGAR flow first (always-live; no "2022" staleness)
    if (isEdgarIntent(userMsg)) {
      const { forms, wantsLatest } = extractFormHints(userMsg);
      const symbolish = extractSymbolish(userMsg);
      // Use full user message for name/ticker resolution, but symbolish helps
      const queryForLookup = symbolish || userMsg;

      const cik = await resolveCIK(queryForLookup);
      if (!cik) {
        return json({
          role: "assistant",
          content:
            "I couldn’t resolve that company. Try a ticker (e.g., NVDA) or paste a 10-digit CIK.",
        });
      }

      const filings = await fetchFilings(cik, forms.length ? forms : null);

      if (!filings?.data?.length) {
        return json({
          role: "assistant",
          content:
            "No filings matched that request. Try widening the date range or removing form filters (e.g., just type the ticker).",
        });
      }

      // If wantsLatest, take most recent one; else return up to 5
      const list = wantsLatest ? filings.data.slice(0, 1) : filings.data.slice(0, 5);
      const lines = list.map(formatFilingLine).join("\n");

      const header =
        wantsLatest && list[0]
          ? `**Latest ${list[0].form} for ${list[0].company ?? list[0].cik}**`
          : `**Recent filings (${list.length}/${filings.total})**`;

      return json({
        role: "assistant",
        content: `${header}\n\n${lines}`,
      });
    }

    // 2) Otherwise, use DeepSeek — but enforce live-first behavior in prompt
    if (!DEEPSEEK_API_KEY) {
      return json(
        {
          role: "assistant",
          content:
            "AI is temporarily unavailable (missing DeepSeek API key). Ask for a filing by ticker/CIK in the meantime.",
        },
        500
      );
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
          ...(body?.messages || []).filter((m) => m.role !== "system"),
        ],
      }),
    });

    if (!dsRes.ok) {
      const txt = await dsRes.text().catch(() => "");
      return json(
        { role: "assistant", content: `AI request failed (${dsRes.status}). ${txt}` },
        502
      );
    }

    const dsJson = await dsRes.json();
    const content =
      dsJson?.choices?.[0]?.message?.content ||
      "I couldn’t generate a reply. Please try rephrasing.";

    return json({ role: "assistant", content });
  } catch (e: any) {
    return json(
      {
        role: "assistant",
        content: `Unexpected error: ${e?.message || "unknown"}`,
      },
      500
    );
  }
}