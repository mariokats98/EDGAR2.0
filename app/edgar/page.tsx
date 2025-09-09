async function getFilings(resetPage = true) {
  try {
    setErr(null);
    setLoading(true);
    if (resetPage) setPage(1);

    let cik = selected?.cik || "";

    // If user typed a CIK, accept it
    const raw = query.trim();
    if (!cik && /^\d{1,10}$/.test(raw)) {
      cik = raw.padStart(10, "0");
    }

    // NEW: auto-lookup ticker/company if no CIK yet
    if (!cik && raw) {
      try {
        const url = apiUrl(`/api/lookup/${encodeURIComponent(raw)}`);
        const lr = await fetch(url, { cache: "no-store" });
        if (lr.ok) {
          const lj = await lr.json();
          if (lj?.cik) cik = lj.cik;
        }
      } catch {
        // ignore lookup failure; we'll error below if still no cik
      }
    }

    if (!cik) {
      setErr("Ticker/Company not recognized. Pick from suggestions or enter a numeric CIK.");
      setRows([]);
      setMeta(null);
      return;
    }

    const qs = new URLSearchParams();
    if (forms.length) qs.set("form", forms.join(","));
    const s = normDate(start);
    const e = normDate(end);
    if (s) qs.set("start", s);
    if (e) qs.set("end", e);
    if (ownerName.trim()) qs.set("owner", ownerName.trim());
    qs.set("page", String(page));
    qs.set("pageSize", String(pageSize));

    const url = apiUrl(`/api/filings/${encodeURIComponent(cik)}?${qs.toString()}`);
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();

    if (!r.ok) throw new Error(j?.error || "Fetch failed");

    setRows(j.data || []);
    setMeta(j.meta || null);
  } catch (e: any) {
    setErr(e?.message || "Error");
    setRows([]);
    setMeta(null);
  } finally {
    setLoading(false);
  }
}