"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Home" },
    { href: "/edgar", label: "EDGAR" },
    { href: "/bls", label: "BLS" },
  ];
  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">Herevna.io</Link>
        <nav className="flex gap-4">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link key={link.href} href={link.href}
                className={`text-sm px-3 py-1 rounded-md ${isActive ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100"}`}>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
