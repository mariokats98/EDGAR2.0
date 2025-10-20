"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useMemo } from "react";

type NavItem = { label: string; href: string; external?: boolean };

const DATA: NavItem[] = [
  { label: "BLS", href: "/bls" },
  { label: "BEA", href: "/bea" },
  { label: "Census", href: "/census" },
  { label: "FRED", href: "/fred" },
];

const MARKETS: NavItem[] = [
  { label: "EDGAR", href: "/edgar" },
  { label: "News", href: "/news" },
  { label: "Screener", href: "/screener" },
];

const TOOLS: NavItem[] = [
  { label: "AI", href: "/ai" },
];

const SECONDARY: NavItem[] = [
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
];

function useActive(pathname: string) {
  return (href: string) =>
    pathname === href
      ? "text-black font-medium"
      : "text-gray-600 hover:text-black";
}

export default function Header() {
  const pathname = usePathname();
  const active = useActive(pathname || "");
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  // If you store pro access on session.user.isPro or role, this covers both.
  const isPro = useMemo(() => {
    const u = session?.user as any;
    return Boolean(u?.isPro || u?.role === "pro" || u?.subscription?.status === "active");
  }, [session]);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Left: Brand */}
        <Link href="/" className="text-lg font-semibold tracking-tight text-black">
          Herevna
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-7 text-sm">
          {/* Primary clusters */}
          <div className="flex items-center gap-6">
            {DATA.map((item) => (
              <Link key={item.href} href={item.href} className={active(item.href)}>
                {item.label}
              </Link>
            ))}
            {MARKETS.map((item) => (
              <Link key={item.href} href={item.href} className={active(item.href)}>
                {item.label}
              </Link>
            ))}
            {TOOLS.map((item) => (
              <Link key={item.href} href={item.href} className={active(item.href)}>
                {item.label}
              </Link>
            ))}
          </div>

          {/* Right cluster */}
          <div className="ml-6 flex items-center gap-4">
            {SECONDARY.map((item) => (
              <Link key={item.href} href={item.href} className={active(item.href)}>
                {item.label}
              </Link>
            ))}

            {/* Auth controls */}
            {status === "loading" ? null : !session?.user ? (
              <Link
                href="/signin"
                className="rounded-md bg-black px-3 py-1.5 text-white font-medium hover:bg-gray-900"
              >
                Sign in
              </Link>
            ) : (
              <>
                {!isPro && (
                  <Link
                    href="/subscribe"
                    className="rounded-md border px-3 py-1.5 font-medium hover:bg-gray-50"
                  >
                    Upgrade
                  </Link>
                )}
                <Link
                  href="/account"
                  className="rounded-md border px-3 py-1.5 font-medium hover:bg-gray-50"
                >
                  Account
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="rounded-md px-3 py-1.5 font-medium hover:bg-gray-50"
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </nav>

        {/* Mobile menu button */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="lg:hidden p-2 rounded hover:bg-gray-100"
          aria-label="Toggle navigation"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
            fill="none"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="lg:hidden border-t bg-white/95 backdrop-blur-sm">
          <div className="grid grid-cols-1 gap-1 p-4 text-sm">
            <Section title="Data">
              {DATA.map((item) => (
                <MobileLink key={item.href} href={item.href} active={active(item.href)} onClick={() => setOpen(false)}>
                  {item.label}
                </MobileLink>
              ))}
            </Section>

            <Section title="Markets">
              {MARKETS.map((item) => (
                <MobileLink key={item.href} href={item.href} active={active(item.href)} onClick={() => setOpen(false)}>
                  {item.label}
                </MobileLink>
              ))}
            </Section>

            <Section title="Tools">
              {TOOLS.map((item) => (
                <MobileLink key={item.href} href={item.href} active={active(item.href)} onClick={() => setOpen(false)}>
                  {item.label}
                </MobileLink>
              ))}
            </Section>

            <div className="mt-2 border-t pt-3">
              {SECONDARY.map((item) => (
                <MobileLink key={item.href} href={item.href} active={active(item.href)} onClick={() => setOpen(false)}>
                  {item.label}
                </MobileLink>
              ))}

              {status === "loading" ? null : !session?.user ? (
                <Link
                  href="/signin"
                  className="mt-3 block w-full rounded-md bg-black px-3 py-2 text-center font-medium text-white hover:bg-gray-900"
                  onClick={() => setOpen(false)}
                >
                  Sign in
                </Link>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {!isPro && (
                    <Link
                      href="/subscribe"
                      className="block w-full rounded-md border px-3 py-2 text-center font-medium hover:bg-gray-50"
                      onClick={() => setOpen(false)}
                    >
                      Upgrade
                    </Link>
                  )}
                  <Link
                    href="/account"
                    className="block w-full rounded-md border px-3 py-2 text-center font-medium hover:bg-gray-50"
                    onClick={() => setOpen(false)}
                  >
                    Account
                  </Link>
                  <button
                    onClick={() => {
                      setOpen(false);
                      signOut({ callbackUrl: "/" });
                    }}
                    className="block w-full rounded-md px-3 py-2 text-center font-medium hover:bg-gray-50"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </div>
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}

function MobileLink({
  href,
  active,
  onClick,
  children,
}: {
  href: string;
  active: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`rounded px-2 py-1 ${active}`}
    >
      {children}
    </Link>
  );
}