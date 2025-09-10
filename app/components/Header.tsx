// app/components/Header.tsx
"use client";

import { useEffect, useState } from "react";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

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
          <a href="/" className="shrink-0 font-bold text-lg tracking-tight text-brand">
            Herevna.io
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLink href="/" label="Home" />
            <NavLink href="/edgar" label="EDGAR" />
            <NavLink href="/bls" label="BLS" />
            <NavLink href="/census" label="Census" />
            <NavLink href="/fred" label="FRED" />
            <NavLink href="/news" label="News" />
            <NavLink href="/screener" label="Screener" />
            <NavLink href="/game" label="Guessonomics" />

            {/* AI CTA (your animated gradient stays as-is) */}
            <a
              href="/ai"
              className="ml-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 text-sm shadow hover:opacity-95 animate-[sheen_2.6s_infinite]"
            >
              ✨ Herevna AI
            </a>
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
            <MobileLink href="/screener" label="Screener" onClick={() => setMobileOpen(false)} />
            <MobileLink href="/game" label="Guessonomics" onClick={() => setMobileOpen(false)} />
            <a
              href="/ai"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 text-sm shadow animate-[sheen_2.6s_infinite]"
            >
              ✨ Herevna AI
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="px-3 py-2 rounded-md text-gray-700 hover:bg-brand hover:text-white transition">
      {label}
    </a>
  );
}

function MobileLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  return (
    <a href={href} onClick={onClick} className="block w-full px-3 py-2 rounded-md hover:bg-gray-100">
      {label}
    </a>
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