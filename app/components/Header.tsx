// app/components/Header.tsx
export default function Header() {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
        {/* Brand */}
        <a href="/" className="font-bold text-lg">Herevna.io</a>

        {/* Nav */}
        <nav className="flex items-center gap-2">
          <a href="/" className="px-3 py-2 rounded-md hover:bg-gray-100">Home</a>
          <a href="/edgar" className="px-3 py-2 rounded-md hover:bg-gray-100">EDGAR</a>
          <a href="/bls" className="px-3 py-2 rounded-md hover:bg-gray-100">BLS</a>

          {/* News dropdown (accessible) */}
          <details className="relative group">
            <summary
              className="list-none px-3 py-2 rounded-md hover:bg-gray-100 cursor-pointer flex items-center gap-1"
              aria-haspopup="menu"
            >
              News
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 transition-transform group-open:rotate-180"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.122l3.71-3.89a.75.75 0 111.08 1.04l-4.24 4.45a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </summary>

            {/* Menu */}
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 rounded-md border bg-white shadow-lg p-1 z-50"
            >
              <a
                role="menuitem"
                href="/news"
                className="block px-3 py-2 rounded hover:bg-gray-100 text-sm"
                title="All sources, latest first"
              >
                All News
              </a>

              <div className="my-1 h-px bg-gray-200" />

              <a
                role="menuitem"
                href="/news?q=earnings"
                className="block px-3 py-2 rounded hover:bg-gray-100 text-sm"
                title="Earnings, guidance, results"
              >
                Earnings
              </a>
              <a
                role="menuitem"
                href="/news?q=merger%20OR%20acquisition"
                className="block px-3 py-2 rounded hover:bg-gray-100 text-sm"
                title="M&A headlines"
              >
                M&amp;A
              </a>
              <a
                role="menuitem"
                href="/news?q=SEC%20filing%20OR%2010-K%20OR%208-K%20OR%2010-Q"
                className="block px-3 py-2 rounded hover:bg-gray-100 text-sm"
                title="News referencing filings"
              >
                Filings-related
              </a>

              <div className="my-1 h-px bg-gray-200" />

              <a
                role="menuitem"
                href="/news?q=inflation%20OR%20CPI%20OR%20jobs%20OR%20GDP%20OR%20Fed"
                className="block px-3 py-2 rounded hover:bg-gray-100 text-sm"
                title="Macro: CPI, jobs, GDP, Fed, etc."
              >
                Macro / Economy
              </a>
              <a
                role="menuitem"
                href="/news?q=AI%20OR%20semiconductor%20OR%20cloud"
                className="block px-3 py-2 rounded hover:bg-gray-100 text-sm"
                title="Theme: AI, semis, cloud"
              >
                Themes (AI / Semis / Cloud)
              </a>

              <div className="my-1 h-px bg-gray-200" />

              {/* Quick ticker filters (edit to your favorites) */}
              <a
                role="menuitem"
                href="/news?tickers=AAPL,MSFT,NVDA"
                className="block px-3 py-2 rounded hover:bg-gray-100 text-sm"
                title="Your quick watchlist (edit list)"
              >
                Watchlist: AAPL / MSFT / NVDA
              </a>
              <a
                role="menuitem"
                href="/news?tickers=SPY,QQQ"
                className="block px-3 py-2 rounded hover:bg-gray-100 text-sm"
                title="Index ETFs"
              >
                Indexes: SPY / QQQ
              </a>
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
}
