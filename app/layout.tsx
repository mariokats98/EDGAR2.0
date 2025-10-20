// app/layout.tsx
import "./styles/globals.css";
import Header from "./components/Header";
import Providers from "./providers";
import { Analytics } from "@vercel/analytics/next";
import { SessionProvider } from "next-auth/react";

export const metadata = {
  title: "Herevna — EDGAR, BLS, FRED & Markets",
  description:
    "Streamlined access to SEC filings, economic data, and market dashboards. Built for clarity and research speed.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-gray-900 antialiased">
        {/* Wrap everything with SessionProvider for NextAuth */}
        <SessionProvider>
          {/* Your custom app-wide Providers (if you have Theme, SWR, etc.) */}
          <Providers>
            {/* Global header */}
            <Header />

            {/* Main content area */}
            <main className="min-h-[60vh]">{children}</main>

            {/* Global footer */}
            <SiteFooter />

            {/* Vercel Analytics */}
            <Analytics />
          </Providers>
        </SessionProvider>
      </body>
    </html>
  );
}

/* ---------------- Footer (inline to avoid missing imports) ---------------- */

function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-white/80 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Herevna</div>
            <p className="text-xs text-gray-600">
              Research faster with clean dashboards for filings, macro, and markets.
            </p>
          </div>

          <nav className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-6 gap-y-2 text-sm">
            <a className="text-gray-700 hover:text-gray-900 hover:underline" href="/about">
              About Us
            </a>
            <a className="text-gray-700 hover:text-gray-900 hover:underline" href="/pricing">
              Pricing
            </a>
            <a className="text-gray-700 hover:text-gray-900 hover:underline" href="/terms">
              Terms of Service
            </a>
            <a className="text-gray-700 hover:text-gray-900 hover:underline" href="/disclaimer">
              Data Disclaimer
            </a>
            <a className="text-gray-700 hover:text-gray-900 hover:underline" href="/cookies">
              Cookies
            </a>
            <a className="text-gray-700 hover:text-gray-900 hover:underline" href="/signin">
              Sign In
            </a>
            <a className="text-gray-700 hover:text-gray-900 hover:underline" href="/account">
              Account
            </a>
          </nav>
        </div>

        <div className="mt-6 text-center text-xs text-gray-500">
          This site republishes SEC EDGAR filings, BLS data, and FRED data. © {year} Herevna.io
        </div>
      </div>
    </footer>
  );
}