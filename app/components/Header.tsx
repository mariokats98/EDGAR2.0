// app/components/Header.tsx
"use client";

import Link from "next/link";
import { useState } from "react";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [screenerMobileOpen, setScreenerMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="shrink-0 font-bold text-lg tracking-tight text-brand">
            Herevna.io
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLink href="/" label="Home" />
            <NavLink href="/edgar" label="EDGAR" />
            <NavLink href="/bls" label="BLS" />
            <NavLink href="/census" label="Census" />
            <NavLink href="/fred" label="FRED" />
            <NavLink href="/news" label="News" />

            {/* Screener dropdown: button trigger (no href) to prevent accidental navigation */}
            <div className="relative group" data-screener>
              <button
                type="button"
                className="px-3 py-2 rounded-md text-gray-700 hover:bg-brand hover:text-white transition inline-flex items-center gap-1 focus:outline-none"
                aria-haspopup="menu"
                aria-expanded="false"
              >
                Screener
                <svg
                  className="h-4 w-4 transition-transform group-hover:rotate-180 group-focus-within:rotate-180"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {/* Menu */}
              <div
                className="pointer-events-none absolute left-0 mt-1 w-56 rounded-md border bg-white shadow-lg opacity-0 translate-y-1
                           group-hover:pointer-events-auto group-hover:opacity-100 group-hover:translate-y-0
                           group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0
                           transition z-[60]"
                role="menu"
                aria-label="Screener submenu"
              >
                <DropdownLink href="/screener/stocks" label="Stocks" />
                <DropdownLink href="/screener/insider-activity" label="Insider Activity" />
                <DropdownLink href="/screener/crypto" label="Crypto" />
                <DropdownLink href="/screener/forex" label="Forex" />
              </div>
            </div>

            <NavLink href="/game" label="Puzzle" />

            {/* AI CTA */}
            <Link
              href="/ai"
              className="ml-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 text-sm shadow hover:opacity-95 animate-[sheen_2.6s_infinite]"
            >
              ✨ Herevna AI
            </Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(v => !v)}
          >
            <Burger open={mobileOpen} />
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-white">
          <nav className="mx-auto max-w-6xl px-4 py-2">
            <MobileLink href="/" label="Home" onClick={() => setMobileOpen(false)} />
            <MobileLink href="/edgar" label="EDGAR" onClick={() => setMobileOpen(false)} />
            <MobileLink href="/bls" label="BLS" onClick={() => setMobileOpen(false)} />
            <MobileLink href="/census" label="Census" onClick={() => setMobileOpen(false)} />
            <MobileLink href="/fred" label="FRED" onClick={() => setMobileOpen(false)} />
            <MobileLink href="/news" label="News" onClick={() => setMobileOpen(false)} />

            {/* Mobile Screener collapsible */}
            <button
              className="flex w-full items-center justify-between px-3 py-2 rounded-md hover:bg-gray-100 text-left"
              aria-expanded={screenerMobileOpen}
              onClick={() => setScreenerMobileOpen(v => !v)}
            >
              <span>Screener</span>
              <svg
                className={`h-4 w-4 transition-transform ${screenerMobileOpen ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {screenerMobileOpen && (
              <div className="ml-2 mt-1 mb-1 space-y-1">
                <MobileLink href="/screener/stocks" label="Stocks" onClick={() => setMobileOpen(false)} />
                <MobileLink href="/screener/insider-activity" label="Insider Activity" onClick={() => setMobileOpen(false)} />
                <MobileLink href="/screener/crypto" label="Crypto" onClick={() => setMobileOpen(false)} />
                <MobileLink href="/screener/forex" label="Forex" onClick={() => setMobileOpen(false)} />
              </div>
            )}

            <MobileLink href="/game" label="Puzzle" onClick={() => setMobileOpen(false)} />
            <Link
              href="/ai"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 text-sm shadow animate-[sheen_2.6s_infinite]"
            >
              ✨ Herevna AI
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

/* ——— Small helpers ——— */

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="px-3 py-2 rounded-md text-gray-700 hover:bg-brand hover:text-white transition">
      {label}
    </Link>
  );
}

function DropdownLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      onClick={(e) => {
        // close via :focus-within as soon as a link is clicked
        const container = e.currentTarget.closest("[data-screener]") as HTMLElement | null;
        container?.blur?.();
      }}
    >
      {label}
    </Link>
  );
}

function MobileLink({
  href,
  label,
  onClick
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className="block w-full px-3 py-2 rounded-md hover:bg-gray-100">
      {label}
    </Link>
  );
}

function Burger({ open }: { open: boolean }) {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      {open ? (
        <path strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path strokeWidth="2" strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18" />
      )}
    </svg>
  );
}