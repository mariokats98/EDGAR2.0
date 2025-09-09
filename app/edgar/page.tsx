// in your existing app/edgar/page.tsx, keep the UI.
// Ensure runSearch only fires when picked?.cik exists:

async function runSearch(p = 1) {
  if (!picked?.cik) {
    setErr("Please choose a company from the suggestions list.");
    return;
  }
  setLoading(true);
  setErr(null);
  setRows([]);
  try {
    const qs = new URLSearchParams({
      cik: picked.cik,
      page: String(p),
      pageSize: String(pageSize),
    });
    if (forms.length) qs.set("form", forms.join(","));
    if (start.trim()) qs.set("start", start.trim()); // YYYY or YYYY-MM or YYYY-MM-DD
    if (end.trim()) qs.set("end", end.trim());
    if (owner.trim()) qs.set("owner", owner.trim());

    const r = await fetch(`/api/filings?${qs.toString()}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j?.error) throw new Error(j?.error || "Fetch failed");
    setRows(j.data || []);
    setMeta(j.meta || null);
    setPage(j.meta?.page || 1);
  } catch (e: any) {
    setErr(e.message || "Error fetching filings");
  } finally {
    setLoading(false);
  }
}