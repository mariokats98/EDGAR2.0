// app/api/insider/route.ts
import { NextResponse } from "next/server";

/**
 * Insider name suggestions using the SEC Search API.
 * We query the public search index for forms 3/4/5 and extract reporter names.
 *
 * Query: GET /api/insider?q=<name fragment>
 *
 * Response shape:
 * {
 *   suggestions: Array<{ name: string; hint?: string }>
 * }
 */

const UA =
  process.env.SEC_USER_AGENT ||
  "Herevna/1.0 (contact@herevna.io)"; // <-- make sure this matches what you set on Vercel

const BASE = "https://efts.sec.gov/LATEST/search-index";

function uniq<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    // Fast guardrails
    if (!q || q.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    // We’ll search ownership-related filings (Forms 3/4/5) and try to surface the reporting person names.
    // The SEC search endpoint supports "keys" and filters; we bias to ownership results.
    // Docs are not official; this is a pragmatic integration many apps use.
    const params = new URLSearchParams({
      // Try to bias to reporter name. Quoting helps reduce noise.
      keys: `"${q}"`,
      // Keep the result size modest—this is just for typeahead suggestions.
      size: "50",
      // Restrict to ownership forms
      formTypes: "3,4,5",
      // Categories commonly used: 'ownership', 'company', 'full'
      category: "ownership",
      // Most recent first
      sort: "date-desc",
    });

    const url = `${BASE}?${params.toString()}`;

    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
      // SEC responds better when no-cache or no-store is used server-side for fresh results
      cache: "no-store",
    });

    if (!r.ok) {
      return NextResponse.json(
        { error: `SEC search failed (${r.status})`, suggestions: [] },
        { status: 502 }
      );
    }

    const j = await r.json().catch(() => ({} as any));
    // The shape typically looks like { hits: { hits: [{ _source: { ... }}, ...]}}
    const hits: any[] = j?.hits?.hits || [];

    // Try several common fields where reporter/insider names show up.
    // Because the SEC index is not perfectly standardized, we defensively collect names.
    const candidates: { name: string; hint?: string }[] = [];

    for (const h of hits) {
      const src = h?._source || {};
      // Possible places a name might appear:
      const maybeNames: string[] = [];

      // 1) Some records include "reportingOwner" / "reportingOwners" style fields
      if (Array.isArray(src.reportingOwners)) {
        for (const ro of src.reportingOwners) {
          if (typeof ro?.name === "string") maybeNames.push(ro.name);
          if (typeof ro?.ownerName === "string") maybeNames.push(ro.ownerName);
        }
      }

      // 2) Free-text form fields sometimes include reporter names (less reliable)
      if (typeof src.reporting_owner === "string") maybeNames.push(src.reporting_owner);
      if (typeof src.owner === "string") maybeNames.push(src.owner);

      // 3) Title/description fallback (last resort)
      if (typeof src.display_names === "string") maybeNames.push(src.display_names);
      if (typeof src.documentDescription === "string") maybeNames.push(src.documentDescription);

      // Normalize and pick decent-looking person-like strings
      for (let raw of maybeNames) {
        raw = String(raw).trim();
        // Quick sanity filter: prefer items that look like "First Last" (at least 2 words, letters)
        if (raw && /\b[a-zA-Z'.-]+\s+[a-zA-Z'.-]+\b/.test(raw)) {
          // Build a small hint (issuer or ticker) if present
          const hintParts: string[] = [];
          if (typeof src.ticker === "string") hintParts.push(src.ticker);
          if (typeof src.display_name === "string") hintParts.push(src.display_name);
          const hint = hintParts.length ? hintParts.join(" • ") : undefined;

          candidates.push({ name: raw, hint });
        }
      }
    }

    const suggestions = uniq(
      candidates.map((c) => ({
        name: c.name.toUpperCase(), // normalize display a bit
        hint: c.hint,
      })),
      (x) => x.name + "|" + (x.hint || "")
    ).slice(0, 20); // trim

    return NextResponse.json({ suggestions });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error", suggestions: [] },
      { status: 500 }
    );
  }
}