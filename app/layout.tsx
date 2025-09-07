import "./styles/globals.css";
import Header from "./components/Header";

export const metadata = {
  title: "Herevna.io — EDGAR & BLS Aggregator",
  description: "Herevna.io republishes SEC EDGAR filings and BLS data with fast search, filters, and release tracking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <Header />
        <main className="min-h-screen">
          {children}
        </main>
        <footer className="mt-12 border-t pt-6 pb-10 text-center text-xs text-gray-500">
          <div>This site republishes SEC EDGAR filings and BLS data.</div>
          <div className="mt-2 flex justify-center">
            <a
              href="https://herevna.io"
              target="_blank"
              className="inline-block bg-black text-white font-semibold px-3 py-1 rounded-full text-sm hover:bg-gray-800 transition"
            >
              Herevna.io
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
