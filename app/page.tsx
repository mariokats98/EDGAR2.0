export default function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <section className="grid md:grid-cols-2 gap-8 items-center">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
            Herevna.io — your fast aggregator for <span className="underline">SEC EDGAR</span> filings and <span className="underline">BLS</span> data
          </h1>
          <p className="mt-4 text-gray-700">
            Search filings across tickers, companies, or CIKs, filter by form type, owners, and date ranges. Track BLS releases
            and pull historical time series with clean charts and exportable data.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/edgar" className="rounded-lg bg-black text-white px-4 py-2 text-sm">Explore EDGAR</a>
            <a href="/bls" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-100">Explore BLS</a>
          </div>
          <ul className="mt-6 text-sm text-gray-600 list-disc pl-5 space-y-2">
            <li>EDGAR: deep history, server-side pagination (10 per page), fast mode, owner & form filters</li>
            <li>BLS: latest releases overview + historical series via the official API v2</li>
            <li>Clean UI, mobile-friendly, and ready for app-store wrapping later</li>
          </ul>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-800 font-medium mb-2">What’s inside</div>
          <ul className="text-sm text-gray-700 space-y-2">
            <li>• EDGAR Filing Cards with quick links to index & primary documents</li>
            <li>• Form filter dropdowns (8-K, 10-Q, 10-K, S-1/424B, or 3/4/5)</li>
            <li>• Reporting person search & role filters (Director / Officer / 10% Owner)</li>
            <li>• Date range + page controls (10/25/50 per page)</li>
            <li>• BLS series query + upcoming releases panel</li>
          </ul>
          <div className="mt-4 text-xs text-gray-500">
            Tip: Add your <code>SEC_USER_AGENT</code> and optional <code>BLS_API_KEY</code> in Vercel → Environment Variables.
          </div>
        </div>
      </section>
    </div>
  );
}
