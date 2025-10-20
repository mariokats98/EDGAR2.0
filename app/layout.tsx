// app/layout.tsx
import "./styles/globals.css";
import Header from "./components/Header";
import SiteFooter from "./components/SiteFooter";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Herevna.io",
  description:
    "Research-friendly dashboards for filings, economic data, and market insights. Information is provided for information & entertainment only.",
  metadataBase: new URL("https://herevna.io"),
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-gray-900">
        <Header />
        {children}

        {/* Global footer with compliance links */}
        <SiteFooter />

        {/* Vercel Web Analytics */}
        <Analytics />
      </body>
    </html>
  );
}