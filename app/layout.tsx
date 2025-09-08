// app/layout.tsx
import "./styles/globals.css";
import type { Metadata } from "next";
import Header from "./components/Header";

export const metadata: Metadata = {
  title: "Herevna.io",
  description:
    "Simplifying Economic, Market & Regulatory Data — EDGAR, BLS, FRED, Screener, and News.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-gray-900 antialiased">
        <Header />
        {children}
      </body>
    </html>
  );
}
