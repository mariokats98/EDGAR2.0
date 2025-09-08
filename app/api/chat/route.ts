// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

const SEC_USER_AGENT = process.env.SEC_USER_AGENT || "herevna.io (contact@herevna.io)";

function baseUrl(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

function looksLikeEdgarLatest(q: string) {
  const s = q.toLowerCase();
  return (
    s.includes("edgar") ||
    s.includes("filing") ||
    s.includes("latest filing") ||
    /\b(10-k|10q|10-q|8-k|6-k|s-1|13d|13g)\b/.test(s) ||
    /\b(cik|ticker)\b/.test(s)
  );
}

function extractTarget(q: string) {
  // Try to grab last “token” after a common preposition
  const m =
    q.match(/\bfor\s+([A-Za-z0-9\.\-&\s]{2,60})$/i) ||
    q.match(/\babout\s+([A-Za-z0-9\.\-&\s]{2,60})$/i) ||
    q.match(/\bof\s+([A-Za-z0-9\.\-&\s]{2,60})$/i);
  return (m ? m[1] : q).trim();
}

function renderAnswer(company: string, filing: any) {
  const lines: string[] = [];
  lines.push(`**Latest EDGAR filing for ${company}**`);
  lines.push(`- **Form**: ${filing.form}`);
  lines.push(`- **Filed**: ${filing.filed_at}`);
  if (filing.title) lines.push(`- **Title**: ${filing.title}`);
  const links: string[] = [];
  if (filing.primary_doc_url) links.push(`[Primary document](${filing.primary_doc_url})`);
  if (filing.source_url) links.push(`[Filing index](${filing.source_url})`);
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

    // Immediate status for UI
    const thinking = { status: "thinking", message: "Working on it…" };

    if (looksLikeEdgarLatest(userText)) {
      const query = extractTarget(userText);
      const origin = baseUrl(req);

      // 1) Resolve ticker/company -> CIK (with fuzzy + candidates)
      const lookupRes = await fetch(`${origin}/api/lookup/${encodeURIComponent(query)}`, {
        headers: { "User-Agent": SEC_USER_AGENT },
        cache: "no-store",
      });
      const L = await lookupRes.json();

      if (!lookupRes.ok || !L?.ok) {
        return NextResponse.json({
          ...thinking,
          final: `I couldn’t find a company for “${query}”. Try a ticker (NVDA), a full name (NVIDIA), or paste a CIK.`,
        });
      }

      // If multiple candidates, ask user to choose
      if (!L.exact && Array.isArray(L.candidates) && L.candidates.length) {
        const list = L.candidates
          .slice(0, 5)
          .map((c: any) => `- **${c.ticker || "—"}** — ${c.name || "Unnamed"} (CIK ${c.cik})`)
          .join("\n");
        return NextResponse.json({
          ...thinking,
          final:
            `I found several matches for “${query}”. Which one do you mean?\n\n${list}\n\n` +
            `Reply with a **ticker** or **CIK** and I’ll pull the latest filing.`,
        });
      }

      const exact = L.exact || (Array.isArray(L.candidates) ? L.candidates[0] : null);
      if (!exact?.cik) {
        return NextResponse.json({
          ...thinking,
          final: `Couldn’t resolve a single match for “${query}”. Try the ticker (e.g., NVDA) if you know it.`,
        });
      }

      // 2) Get recent filings
      const filingsRes = await fetch(`${origin}/api/filings/${encodeURIComponent(exact.cik)}?limit=12`, {
        headers: { "User-Agent": SEC_USER_AGENT },
        cache: "no-store",
      });
      if (!filingsRes.ok) {
        const err = await filingsRes.json().catch(() => ({}));
        return NextResponse.json({
          ...thinking,
          final: `SEC fetch failed for **${exact.name || exact.ticker}** (CIK ${exact.cik}). ${err?.error ? `Details: ${err.error}` : ""}`,
        });
      }
      const filings = await filingsRes.json();
      const arr = Array.isArray(filings) ? filings : filings?.data || [];
      if (!arr.length) {
        return NextResponse.json({
          ...thinking,
          final: `No filings found for **${exact.name || exact.ticker}** (CIK ${exact.cik}).`,
        });
      }

      // 3) Pick most recent by date
      arr.sort((a: any, b: any) => String(b.filed_at).localeCompare(String(a.filed_at)));
      const latest = arr[0];
      const final = renderAnswer(exact.name || exact.ticker, latest);
      return NextResponse.json({ ...thinking, final });
    }

    // Not an EDGAR-latest question: your LLM can handle this part.
    // (Left neutral on purpose.)
    return NextResponse.json({
      status: "done",
      final: "Ask me about EDGAR filings (e.g., “latest filing for NVDA”).",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
