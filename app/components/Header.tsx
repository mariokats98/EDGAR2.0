"use client";

import Link from "next/link";
import { useState } from "react";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b bg-white sticky top-0 z-50">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold">
          Herevna
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4">
          <Link href="/edgar" className="text-sm text-gray-700 hover:text-black">
            EDGAR
          </Link>
          <Link href="/news" className="text-sm text-gray-700 hover:text-black">
            News
          </Link>
          <Link href="/screener" className="text-sm text-gray-700 hover:text-black">
            Screener
          </Link>

          {/* AI Button */}
          <a
            href="/ai"
            className="liquid-btn ml-2 inline-flex items-center gap-2 px-4 py-2 text-sm shadow"
          >
            <span>✨ Herevna AI</span>
          </a>
        </nav>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          ☰
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-white px-4 pb-4">
          <Link
            href="/edgar"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm text-gray-700 hover:text-black"
          >
            EDGAR
          </Link>
          <Link
            href="/news"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm text-gray-700 hover:text-black"
          >
            News
          </Link>
          <Link
            href="/screener"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm text-gray-700 hover:text-black"
          >
            Screener
          </Link>

          {/* AI Button (mobile) */}
          <a
            href="/ai"
            onClick={() => setMobileOpen(false)}
            className="liquid-btn mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm shadow"
          >
            <span>✨ Herevna AI</span>
          </a>
        </div>
      )}
    </header>
  );
}