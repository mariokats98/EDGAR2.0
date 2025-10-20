"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b bg-white/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-semibold">Herevna</Link>

        <nav className="flex items-center gap-4">
          <Link href="/pricing" className={linkStyle(pathname === "/pricing")}>
            Pricing
          </Link>
          <Link href="/about" className={linkStyle(pathname === "/about")}>
            About
          </Link>

          {!session?.user ? (
            <Link
              href="/signin"
              className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900"
            >
              Sign in
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/account"
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
              >
                Account
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
              >
                Sign out
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

function linkStyle(active: boolean) {
  return `text-sm font-medium ${active ? "text-black" : "text-gray-600 hover:text-black"}`;
}