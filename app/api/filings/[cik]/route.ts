import { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { cik: string } }
) {
  const { cik } = params;

  if (!cik || !cik.trim()) {
    return Response.json(
      { error: "Missing identifier. Provide CIK, ticker, or company name." },
      { status: 400 }
    );
  }

  // 🔑 Normalize identifier
  const identifier = decodeURIComponent(cik).trim().toUpperCase();

  // TODO: lookup identifier → real CIK
  // (either directly if it's all digits, or by ticker lookup)
  // Example for now:
  const resolvedCIK =
    /^\d+$/.test(identifier) && identifier.length <= 10
      ? identifier.padStart(10, "0")
      : await resolveToCIK(identifier);

  if (!resolvedCIK) {
    return Response.json(
      { error: "Ticker/Company not recognized. Pick from suggestions or enter a numeric CIK." },
      { status: 400 }
    );
  }

  // continue → call SEC search API with resolvedCIK
  const url = `https://data.sec.gov/submissions/CIK${resolvedCIK}.json`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": process.env.SEC_USER_AGENT || "herevna.io (admin@herevna.io)",
      Accept: "application/json",
    },
  });

  if (!r.ok) {
    return Response.json({ error: "SEC fetch failed" }, { status: r.status });
  }

  const j = await r.json();
  return Response.json({ ok: true, data: j });
}

// --- helper ---
async function resolveToCIK(id: string): Promise<string | null> {
  // Example: use SEC ticker file
  try {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json");
    if (!res.ok) return null;
    const tickers: Record<
      string,
      { cik_str: number; ticker: string; title: string }
    > = await res.json();
    const entry = Object.values(tickers).find(
      (x) =>
        x.ticker.toUpperCase() === id ||
        x.title.toUpperCase().includes(id)
    );
    return entry ? String(entry.cik_str).padStart(10, "0") : null;
  } catch {
    return null;
  }
}