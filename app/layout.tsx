import "./styles/globals.css";

export const metadata = {
  title: "EDGAR Filing Cards",
  description: "Simple, fast EDGAR filing explorer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50">{children}</body>
    </html>
  );
}
