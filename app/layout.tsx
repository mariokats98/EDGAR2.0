// app/layout.tsx
import "./styles/globals.css";
import type { Metadata } from "next";
import Header from "./components/Header";

export const metadata: Metadata = {
  title: "Herevna.io",
  description: "Aggregator for SEC EDGAR filings, BLS data, and Market News.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <Header />
        <main>{children}</main>
        <footer className="mt-10 border-t bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-gray-600 flex flex-wrap items-center gap-3">
            <span>© {new Date().getFullYear()} Herevna.io</span>
            <span className="mx-2">•</span>
            <span>This site republishes SEC EDGAR filings and BLS data.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
