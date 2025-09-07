"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md text-sm ${
        active ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      {children}
    </Link>
  );
}

export default function Header() {
  return (
    <header className="border-b bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 sticky top-0 z-30">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-block bg-black text-white px-2 py-1 rounded-md text-xs font-semibold tracking-wide">
            Herevna.io
          </span>
          <span className="text-sm text-gray-600 hidden sm:inline">EDGAR & BLS Aggregator</span>
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink href="/edgar">EDGAR</NavLink>
          <NavLink href="/bls">BLS</NavLink>
        </nav>
      </div>
    </header>
  );
}

