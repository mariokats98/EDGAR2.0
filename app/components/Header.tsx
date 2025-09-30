// app/components/Header.tsx
"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

type Point = { top: number; left: number; width: number; height: number };

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  // ---- Screener dropdown state (desktop) ----
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Point | null>(null);
  const triggerRef = useRef<HTMLAnchorElement | null>(null);
  const closeTimer = useRef<number | null>(null);

  const pathname = usePathname();

  // Close menus when route changes
  useEffect(() => {
    setOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reposition on scroll/resize
  useLayoutEffect(() => {
    function updatePos() {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height });
    }
    if (open) {
      updatePos();
      window.addEventListener("scroll", updatePos, true);
      window.addEventListener("resize", updatePos);
      return () => {
        window.removeEventListener("scroll", updatePos, true);
        window.removeEventListener("resize", updatePos);
      };
    }
  }, [open]);

  // Helpers to manage small hover gaps
  function safeOpen() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (!open) {
      if (triggerRef.current) {
        const r = triggerRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height });
      }
      setOpen(true);
    }
  }
  function delayedClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120) as unknown as number;
  }

  // Click outside to close
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node | null;
      if (triggerRef.current && triggerRef.current.contains(t)) return;
      // If the portal menu is clicked, it has data-attr we can check
      const el = (t as HTMLElement | null)?.closest?.("[data-screener-menu]");
      if (!el) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const items = [
    { href: "/screener/stocks", label: "Stocks" },
    { href: "/screener/insider", label: "Insider Activity" },
    { href: "/screener/crypto", label: "Crypto" },
    { href: "/screener/forex", label: "Forex" },
  ];

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

            {/* Screener trigger (desktop) */}
            <a
              href="/screener/stocks"
              ref={triggerRef}
              className="px-3 py-2 rounded-md text-gray-700 hover:bg-brand hover:text-white transition relative"
              onMouseEnter={safeOpen}
              onFocus={safeOpen}
              onMouseLeave={delayedClose}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={(e) => {
                // Let normal click take you to Stocks; menu is for choosing others.
                // If you prefer click to just open the menu, uncomment:
                // e.preventDefault(); safeOpen();
              }}
            >
              Screener ▾
            </a>

            <NavLink href="/game" label="Puzzle" />

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
            <MobileLink href="/census" label="Census" onClick={() => setMobileOpen(false)} />
            <MobileLink href="/fred" label="FRED" onClick={() => setMobileOpen(false)} />
            <MobileLink href="/news" label="News" onClick={() => setMobileOpen(false)} />

            {/* Collapsible Screener group (mobile) */}
            <div className="mt-1">
              <div className="px-3 py-2 text-gray-500 text-xs uppercase tracking-wide">Screener</div>
              {items.map((it) => (
                <MobileLink key={it.href} href={it.href} label={it.label} onClick={() => setMobileOpen(false)} />
              ))}
            </div>

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

      {/* Desktop dropdown rendered via portal so it’s never hidden */}
      {open && pos &&
        createPortal(
          <div
            data-screener-menu
            onMouseEnter={safeOpen}
            onMouseLeave={delayedClose}
            className="absolute"
            style={{
              position: "absolute",
              top: pos.top + 6,
              left: pos.left,
              zIndex: 9999,
            }}
          >
            <div className="w-56 overflow-hidden rounded-lg border bg-white shadow-xl">
              {items.map((it, i) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`block px-3 py-2 text-sm hover:bg-gray-50 ${i !== 0 ? "border-t" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  {it.label}
                </Link>
              ))}
            </div>
          </div>,
          document.body
        )}
    </header>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="px-3 py-2 rounded-md text-gray-700 hover:bg-brand hover:text-white transition">
      {label}
    </Link>
  );
}

function MobileLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
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