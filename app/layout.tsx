// app/layout.tsx
import "./styles/globals.css";
import Header from "./components/Header";


// ✅ Import Vercel Analytics
import { Analytics } from "@vercel/analytics/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-white to-slate-50">
        <Header />
        {children}

        {/* Vercel Web Analytics */}
        <Analytics />

  
        
      </body>
    </html>
  );
}