// app/components/Header.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const nav = [
  { href: "/edgar", label: "EDGAR" },
  { href: "/bls", label: "BLS" },
  { href: "/fred", label: "FRED" },
  { href: "/news", label: "News" },
  { href: "/pricing", label: "Pricing" }
];

export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Herevna
        </Link>

        <nav className="hidden md:flex items-center gap-5 text-sm">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`hover:text-gray-900 ${
                pathname?.startsWith(n.href) ? "text-gray-900" : "text-gray-700"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {session?.user?.email ? (
            <>
              <Link href="/account" className="text-sm text-gray-700 hover:text-gray-900">
                Account
              </Link>
              <a href="/api/auth/signout" className="text-sm underline">
                Sign out
              </a>
            </>
          ) : (
            <Link href="/signin" className="text-sm underline">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}