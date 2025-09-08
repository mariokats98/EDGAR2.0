// app/api/chat/route.ts
import { NextResponse, NextRequest } from "next/server";

/** Make sure this env is set in Vercel (Project → Settings → Env Vars) */
const SEC_USER_AGENT = process.env.SEC_USER_AGENT || "herevna.io (contact@herevna.io)";

/** Helper: build absolute URL to call your own API from the server */
function baseUrl(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = (req.headers.get("x-forwarded-proto") || "https");
  return `${proto}://${host}`;
}

/** Heuristic: is this an EDGAR question about “latest filings”? */
function seemsEdgarLatest(q: string) {
  const s = q.toLowerCase();
  return (
    s.includes("edgar") ||
    s.includes("filing") ||
    s.includes("10-k") ||
    s.includes("10q") ||
    s.includes("10-q") ||
    s.includes("8-k") ||
    s.includes("s-1") ||
    s.includes("6-k") ||
    s.includes("13d") ||
    s.includes("13g") ||
    s.includes("latest filing") ||
    s.match(/\b(cik|ticker)\b/)
  );
}

/** Try to extract a likely ticker/company token (very forgiving) */
function extractQueryToken(q: string) {
  // Grab last “word” after common prepositions: “for TSLA”, “for Webull”, etc.
  const m = q.match(/\bfor\s+([A-Za-z0-9\.\- ]{2,40})$/i) ||
            q.match(/\babout\s+([A-Za-z0-9\.\- ]{2,40})$/i) ||
            q.match(/\bof\s+([A-Za-z0-9\.\- ]{2,40})$/i);
  if (m) return m[1].trim();
  // Otherwise, return the whole thing and let /api/lookup be smart
  return q.trim();
}

/** Compose a crisp, link-first answer */
function renderEdgarAnswer(cik: string, company: string, filing: any) {
  const lines: string[] = [];
  lines.push(`**Latest EDGAR filing for ${company}**`);
  lines.push(`- **Form**: ${filing.form}`);
  lines.push(`- **Filed**: ${filing.filed_at}`);
  if (filing.title) lines.push(`- **Title**: ${filing.title}`);

  const links: string[] = [];
  if (filing.primary_doc_url) links.push(`[Primary document](${filing.primary_doc_url})`);
  if (filing.source_url) links.push(`[Filing index](${filing.source_url})`);
  // Add direct archive root if available
  if (!filing.source_url && cik && filing.accession) {
    const cikNum = String(parseInt(cik, 10));
    const archive = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${filing.accession.replace(/-/g, "")}`;
    links.push(`[EDGAR archive](${archive})`);
  }

  if (links.length) lines.push(`- **Downloads**: ${links.join(" • ")}`);

  if (Array.isArray(filing.badges) && filing.badges.length) {
    lines.push(`- **Highlights**: ${filing.badges.join(", ")}`);
  }
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userText: string =
      body?.message?.trim() ||
      (Array.isArray(body?.messages) ? String(body.messages.at(-1)?.content || "") : "").trim();

    if (!userText) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    // Always give the client something to show immediately (you can use this to display a “Thinking…” bar)
    // If your client expects streaming, you can keep this simple JSON and just show a spinner until 'final' arrives.
    const thinking = { status: "thinking", message: "Working on it…" };

    // If it looks like an EDGAR “latest filing” question, ground to your own API
    if (seemsEdgarLatest(userText)) {
      const q = extractQueryToken(userText);
      const origin = baseUrl(req);

      // 1) Resolve to CIK via your lookup route (supports tickers and names)
      //    We try: /api/lookup/{token}  (you already have this dynamic route)
      const look = await fetch(`${origin}/api/lookup/${encodeURIComponent(q)}`, {
        headers: { "User-Agent": SEC_USER_AGENT },
        cache: "no-store",
      });

      if (!look.ok) {
        // Fall back to suggest API if you have it, else return graceful error
        // const sug = await fetch(`${origin}/api/suggest?q=${encodeURIComponent(q)}`);
        return NextResponse.json({
          ...thinking,
          final: `I couldn't resolve **${q}** to a CIK. Try a ticker (e.g., AAPL), the company’s full name, or a known CIK.`,
        }, { status: 200 });
      }

      const j = await look.json();
      const cik = j?.cik || j?.data?.cik; // be tolerant about shape
      const name = j?.name || j?.data?.name || q;

      if (!cik) {
        return NextResponse.json({
          ...thinking,
          final: `I couldn't resolve **${q}** to a CIK. Try a ticker (e.g., AAPL), the company’s full name, or a known CIK.`,
        }, { status: 200 });
      }

      // 2) Fetch recent filings and pick the most recent
      const filingsRes = await fetch(`${origin}/api/filings/${encodeURIComponent(cik)}?limit=12`, {
        headers: { "User-Agent": SEC_USER_AGENT },
        cache: "no-store",
      });

      if (!filingsRes.ok) {
        const err = await filingsRes.json().catch(() => ({}));
        return NextResponse.json({
          ...thinking,
          final: `SEC fetch failed for **${name}** (CIK ${cik}). ${err?.error ? `Details: ${err.error}` : ""}`,
        }, { status: 200 });
      }

      const filings = await filingsRes.json();
      const arr = Array.isArray(filings) ? filings : filings?.data || [];

      if (!arr.length) {
        return NextResponse.json({
          ...thinking,
          final: `No filings found for **${name}** (CIK ${cik}).`,
        }, { status: 200 });
      }

      // Sort desc by filed_at just in case
      arr.sort((a: any, b: any) => String(b.filed_at).localeCompare(String(a.filed_at)));
      const latest = arr[0];

      // 3) Compose clean, link-first reply
      const final = renderEdgarAnswer(cik, name, latest);

      return NextResponse.json({ ...thinking, final }, { status: 200 });
    }

    // -------- Non-EDGAR questions fall back to your LLM (DeepSeek) ----------
    // If you already wired /api/chat to DeepSeek, keep that call here.
    // IMPORTANT: Keep a system instruction telling the model to NEVER invent EDGAR answers,
    // and to ask the server (this route) to run the grounded lookup when filings are requested.
    // Example (pseudo):
    //
    // const r = await fetch("https://api.deepseek.com/chat/completions", { ... });
    // const modelReply = await r.json();
    // return NextResponse.json({ status: "done", final: modelReply.choices[0].message.content });
    //
    // For now, return a neutral response:
    return NextResponse.json({
      status: "done",
      final: "Ask me about EDGAR filings (e.g., “latest filing for AAPL” or “latest 6-K for NVDA”).",
    });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
