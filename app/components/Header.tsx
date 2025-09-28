// app/components/Header.tsx
"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [screenerOpen, setScreenerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 224 });
  const pathname = usePathname();

  // Reposition the dropdown relative to the trigger
  const calcPos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({
      top: Math.round(r.bottom + 6),         // a little gap below button
      left: Math.round(r.left),              // align left edges
      width: Math.max(224, Math.round(r.width)), // keep a min width
    });
  };

  useLayoutEffect(() => {
    if (screenerOpen) calcPos();
  }, [screenerOpen]);

  // Close on route change
  useEffect(() => {
    setScreenerOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  // Close on outside click / Escape / scroll / resize
  useEffect(() => {
    if (!screenerOpen) return;

    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t)) {
        // since menu is portaled, any click not on trigger should close
        setScreenerOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setScreenerOpen(false);
    const onScroll = () => calcPos();
    const onResize = () => calcPos();

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [screenerOpen]);

  return (
    <header className="sticky top-0 z-[1000] border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
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

            {/* Screener (click to open, menu rendered in a portal) */}
            <div className="relative">
              <button
                ref={triggerRef}
                type="button"
                className="px-3 py-2 rounded-md text-gray-700 hover:bg-brand hover:text-white transition inline-flex items-center gap-1"
                aria-haspopup="menu"
                aria-expanded={screenerOpen}
                onClick={() => setScreenerOpen(v => !v)}
              >
                Screener
                <svg
                  className={`h-4 w-4 transition-transform ${screenerOpen ? "rotate-180" : ""}`}
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
            </div>

            {/* Portal menu */}
            {screenerOpen &&
              createPortal(
                <div
                  role="menu"
                  aria-label="Screener submenu"
                  style={{
                    position: "fixed",
                    top: menuPos.top,
                    left: menuPos.left,
                    minWidth: menuPos.width,
                  }}
                  className="z-[9999] rounded-md border bg-white shadow-lg p-1"
                >
                  <DropdownLink href="/screener/stocks" label="Stocks" onNavigate={() => setScreenerOpen(false)} />
                  <DropdownLink href="/screener/insider-activity" label="Insider Activity" onNavigate={() => setScreenerOpen(false)} />
                  <DropdownLink href="/screener/crypto" label="Crypto" onNavigate={() => setScreenerOpen(false)} />
                  <DropdownLink href="/screener/forex" label="Forex" onNavigate={() => setScreenerOpen(false)} />
                </div>,
                document.body
              )
            }

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
            <details className="rounded-md">
              <summary className="list-none flex w-full items-center justify-between px-3 py-2 rounded-md hover:bg-gray-100 cursor-pointer">
                <span>Screener</span>
                <svg className="h-4 w-4 transition-transform" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </summary>
              <div className="ml-2 mt-1 mb-1 space-y-1">
                <MobileLink href="/screener/stocks" label="Stocks" onClick={() => setMobileOpen(false)} />
                <MobileLink href="/screener/insider-activity" label="Insider Activity" onClick={() => setMobileOpen(false)} />
                <MobileLink href="/screener/crypto" label="Crypto" onClick={() => setMobileOpen(false)} />
                <MobileLink href="/screener/forex" label="Forex" onClick={() => setMobileOpen(false)} />
              </div>
            </details>

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

function DropdownLink({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="block rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      onClick={onNavigate}
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