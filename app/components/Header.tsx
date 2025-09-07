// app/components/Header.tsx
"use client";

import { useEffect, useState, useRef } from "react";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false); // desktop dropdown
  const [newsMobileOpen, setNewsMobileOpen] = useState(false); // mobile accordion

  const closeTimeout = useRef<NodeJS.Timeout | null>(null);

  // Close mobile menu on route change (in case user navigates via links)
  useEffect(() => {
    const handler = () => setMobileOpen(false);
    window.addEventListener("hashchange", handler);
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("popstate", handler);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Brand */}
          <a
            href="/"
            className="shrink-0 font-bold text-lg tracking-tight text-brand"
          >
            Herevna.io
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLink href="/" label="Home" />
            <NavLink href="/edgar" label="EDGAR" />
            <NavLink href="/bls" label="BLS" />

            {/* News dropdown (desktop) */}
            <div
              className="relative"
              onMouseEnter={() => {
                if (closeTimeout.current) clearTimeout(closeTimeout.current);
                setNewsOpen(true);
              }}
              onMouseLeave={() => {
                closeTimeout.current = setTimeout(() => setNewsOpen(false), 150);
              }}
            >
              <button
                className="px-3 py-2 rounded-md text-gray-700 hover:bg-brand hover:text-white transition inline-flex items-center gap-1"
                aria-haspopup="menu"
                aria-expanded={newsOpen}
              >
                News
                <ChevronDown open={newsOpen} />
              </button>
              {newsOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 rounded-md border bg-white shadow-lg p-1 z-50"
                  onMouseEnter={() => {
                    if (closeTimeout.current) clearTimeout(closeTimeout.current);
                    setNewsOpen(true);
                  }}
                  onMouseLeave={() => {
                    closeTimeout.current = setTimeout(() => setNewsOpen(false), 150);
                  }}
                >
                  <MenuItem href="/news" label="All News" />
                  <Divider />
                  <MenuItem href="/news?category=earnings" label="Earnings" />
                  <MenuItem href="/news?category=mna" label="M&A" />
                  <MenuItem href="/news?category=filings" label="Filings-related" />
                  <MenuItem href="/news?category=macro" label="Macro / Economy" />
                  <MenuItem href="/news?category=themes" label="Themes (AI / Semis / Cloud)" />
                </div>
              )}
            </div>

            <NavLink href="/screener" label="Screener" />
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
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

            {/* News accordion (mobile) */}
            <button
              className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 flex items-center justify-between"
              onClick={() => setNewsMobileOpen((v) => !v)}
              aria-expanded={newsMobileOpen}
            >
              <span>News</span>
              <ChevronDown open={newsMobileOpen} />
            </button>
            {newsMobileOpen && (
              <div className="ml-2 mt-1 space-y-1">
                <MobileSubLink href="/news" label="All News" onClick={() => setMobileOpen(false)} />
                <MobileSubLink href="/news?category=earnings" label="Earnings" onClick={() => setMobileOpen(false)} />
                <MobileSubLink href="/news?category=mna" label="M&A" onClick={() => setMobileOpen(false)} />
                <MobileSubLink href="/news?category=filings" label="Filings-related" onClick={() => setMobileOpen(false)} />
                <MobileSubLink href="/news?category=macro" label="Macro / Economy" onClick={() => setMobileOpen(false)} />
                <MobileSubLink href="/news?category=themes" label="Themes (AI / Semis / Cloud)" onClick={() => setMobileOpen(false)} />
              </div>
            )}

            <MobileLink href="/screener" label="Screener" onClick={() => setMobileOpen(false)} />
          </nav>
        </div>
      )}
    </header>
  );
}

/* ---------- small atoms ---------- */

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="px-3 py-2 rounded-md text-gray-700 hover:bg-brand hover:text-white transition"
    >
      {label}
    </a>
  );
}

function MenuItem({ href, label }: { href: string; label: string }) {
  return (
    <a
      role="menuitem"
      href={href}
      className="block rounded px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
    >
      {label}
    </a>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-gray-200" />;
}

function MobileLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="block w-full px-3 py-2 rounded-md hover:bg-gray-100"
    >
      {label}
    </a>
  );
}

function MobileSubLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="block w-full px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-100"
    >
      {label}
    </a>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : "rotate-0"}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.12l3.71-3.89a.75.75 0 111.08 1.04l-4.24 4.45a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function Burger({ open }: { open: boolean }) {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      {open ? (
        <path strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path strokeWidth="2" strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18" />
      )}
    </svg>
  );
}
