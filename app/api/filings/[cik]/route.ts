export async function GET(req: Request, { params }: { params: { cik: string } }) {
  try {
    const cik10 = zeroPadCIK(params.cik);
    const { searchParams, host } = new URL(req.url);

    const maxParam = Number(searchParams.get("max") || "300");
    const max = Math.max(1, Math.min(2000, isFinite(maxParam) ? maxParam : 300));

    // NEW: optional server-side date range
    const from = searchParams.get("from"); // "YYYY-MM-DD" inclusive
    const to = searchParams.get("to");     // "YYYY-MM-DD" inclusive

    const rows = await loadAllFilings(cik10, host);

    // Sort desc already in loadAllFilings; now apply date filtering BEFORE slicing
    let rowsFiltered = rows;
    if (from) rowsFiltered = rowsFiltered.filter((r) => r.filingDate >= from);
    if (to)   rowsFiltered = rowsFiltered.filter((r) => r.filingDate <= to);

    // Now slice to max AFTER date filtering
    const selected = rowsFiltered.slice(0, max);

    const cikNoPad = String(parseInt(cik10, 10));
    const results: any[] = [];

    for (const r of selected) {
      const accNoDash = r.accessionNumber.replace(/-/g, "");
      const base = `https://www.sec.gov/Archives/edgar/data/${cikNoPad}/${accNoDash}`;
      const primary = r.primaryDocument ? `${base}/${r.primaryDocument}` : null;
      const form = r.form.toUpperCase();

      let items: string[] = [];
      let badges: string[] = [];
      let amount_usd: number | null = null;
      let owner_roles: string[] = [];
      let owner_names: string[] = [];

      if (primary) {
        try {
          const pr = await fetch(primary, { headers: { "User-Agent": SEC_HEADERS["User-Agent"] as string } });
          if (pr.ok) {
            const content = await pr.text();

            if (isHtmlLike(primary) && form.startsWith("8-K")) {
              const text = content.replace(/<[^>]+>/g, " ");
              const found = detectItems(text);
              items = found.items;
              badges = found.badges;
            }

            if (isHtmlLike(primary) && (form.startsWith("S-1") || form.startsWith("424B"))) {
              const text = content.replace(/<[^>]+>/g, " ");
              amount_usd = extractLargestAmount(text);
            }

            if (isXmlLike(primary) && (form === "3" || form === "4" || form === "5")) {
              const parsed = extractOwnerFromXml(content);
              owner_roles = parsed.roles;
              owner_names = parsed.ownerNames;
            }
          }
        } catch {}
      }

      results.push({
        cik: cik10,
        form: r.form,
        filed_at: r.filingDate,
        title: `${r.form} • ${r.filingDate}`,
        source_url: base,
        primary_doc_url: primary,
        items,
        badges,
        amount_usd,
        owner_roles,
        owner_names,
      });
    }

    return NextResponse.json(results, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
