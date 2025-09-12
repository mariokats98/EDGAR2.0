// inside app/api/insider/route.ts (server)
async function enrichFromSEC(cik: string, accNo: string) {
  try {
    const noPad = String(parseInt(cik, 10)); // drop leading zeros for URL
    const base = `https://www.sec.gov/Archives/edgar/data/${noPad}/${accNo.replace(/-/g, "")}`;
    const idx = await fetch(`${base}/index.json`, { headers: { "User-Agent": "Herevna/1.0" }, cache: "no-store" });
    if (!idx.ok) return null;
    const j = await idx.json();

    const xmlEntry =
      (j?.directory?.item || []).find((f: any) => /\.xml$/i.test(f.name)) || null;
    if (!xmlEntry) return { indexUrl: `${base}/index.html`, formUrl: `${base}/index.html` };

    const xmlUrl = `${base}/${xmlEntry.name}`;
    const xr = await fetch(xmlUrl, { headers: { "User-Agent": "Herevna/1.0" }, cache: "no-store" });
    if (!xr.ok) return { indexUrl: `${base}/index.html`, formUrl: `${base}/index.html` };
    const xml = await xr.text();

    // pull the FIRST nonDerivativeTransaction block
    const firstTxn = xml.match(/<nonDerivativeTransaction>[\s\S]*?<\\/nonDerivativeTransaction>/i)?.[0] || "";
    const get = (tag: string) =>
      firstTxn.match(new RegExp(`<${tag}>\\s*<value>([\\s\\S]*?)<\\/value>\\s*<\\/${tag}>`, "i"))?.[1]?.trim();

    const ad = get("transactionAcquiredDisposedCode");   // "A" or "D"
    const shares = Number(get("transactionShares") || "");
    const price = Number(get("transactionPricePerShare") || "");
    const ownedAfter = Number(get("sharesOwnedFollowingTransaction") || "");
    const filedAt = xml.match(/<periodOfReport>(.*?)<\\/periodOfReport>/i)?.[1]?.trim();
    const transDate = get("transactionDate");

    return {
      indexUrl: `${base}/index.html`,
      formUrl: xmlUrl, // direct XML; the index.html is also fine for users
      // Parsed values (only include if finite)
      txnType: ad === "A" || ad === "D" ? (ad as "A" | "D") : undefined,
      shares: Number.isFinite(shares) ? shares : undefined,
      price: Number.isFinite(price) ? price : undefined,
      ownedAfter: Number.isFinite(ownedAfter) ? ownedAfter : undefined,
      filedAt: filedAt || undefined,
      transDate: transDate || undefined,
    };
  } catch {
    return null;
  }
}