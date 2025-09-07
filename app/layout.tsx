import "./styles/globals.css";
import Header from "./components/Header";

export const metadata = {
  title: "Herevna.io — EDGAR + BLS Aggregator",
  description:
    "Herevna.io aggregates SEC EDGAR filings and BLS economic data in one interface.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        {/* Global Header */}
        <Header />

        {/* Page content */}
        <main className="min-h-screen">{children}</main>

        {/* Global footer */}
        <footer className="border-t mt-10 py-6 text-center text-xs text-gray-500">
          <p>
            This site republishes SEC EDGAR filings and BLS data. ©{" "}
            {new Date().getFullYear()} Herevna.io
          </p>
        </footer>
      </body>
    </html>
  );
}

