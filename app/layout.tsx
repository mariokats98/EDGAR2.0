// app/layout.tsx
import "./styles/globals.css";
import Header from "./components/Header";
import AIChat from "./components/AIChat"; // ← add this

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-white to-slate-50">
        <Header />
        {children}
        <AIChat /> {/* ← floating chat lives here */}
      </body>
    </html>
  );
}

