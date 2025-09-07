// app/components/Header.tsx

"use client";
import { useState } from "react";

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b bg-white sticky top-0 z-50">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <a href="/" className="font-bold text-lg tracking-tight text-gray-900">
          Herevna.io
        </a>

        {/* Nav */}
        <nav className="flex gap-4 relative">
          <a
            href="/"
            className="px-3 py-2 rounded-md hover:bg-gray-100 transition"
          >
            Home
          </a>
          <a
            href="/edgar"
            className="px-3 py-2 rounded-md hover:bg-gray-100 transition"
          >
            EDGAR
          </a>
          <a
            href="/bls"
            className="px-3 py-2 rounded-md hover:bg-gray-100 transition"
          >
            BLS
          </a>

          {/* News dropdown */}
          <div
            className="relative"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            <button
              className="px-3 py-2 rounded-md hover:bg-gray-100 transition flex items-center gap-1"
            >
              News ▾
            </button>
            {open && (
              <div className="absolute left-0 mt-2 w-40 rounded-md border bg-white shadow-lg z-50">
                <a
                  href="/news?category=markets"
                  className="block px-4 py-2 text-sm hover:bg-gray-100"
                >
                  Markets
                </a>
                <a
                  href="/news?category=earnings"
                  className="block px-4 py-2 text-sm hover:bg-gray-100"
                >
                  Earnings
                </a>
                <a
                  href="/news?category=ma"
                  className="block px-4 py-2 text-sm hover:bg-gray-100"
                >
                  M&amp;A
                </a>
                <a
                  href="/news?category=macro"
                  className="block px-4 py-2 text-sm hover:bg-gray-100"
                >
                  Macro
                </a>
                <a
                  href="/news"
                  className="block px-4 py-2 text-sm hover:bg-gray-100"
                >
                  All News
                </a>
              </div>
            )}
          </div>

          <a
            href="/screener"
            className="px-3 py-2 rounded-md hover:bg-gray-100 transition"
          >
            Screener
          </a>
        </nav>
      </div>
    </header>
  );
}

