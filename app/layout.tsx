// app/layout.tsx
import "./styles/globals.css";
import Header from "./components/Header";
import AIChat from "./components/AIChat";

// ✅ import from the Next.js export
import { Analytics } from "@vercel/analytics/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-white to-slate-50">
        <Header />
        {children}

        {/* Vercel Web Analytics */}
        <Analytics />

        {/* your floating chat */}
        <AIChat />
      </body>
    </html>
  );
}