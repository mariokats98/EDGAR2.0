// app/components/SiteFooter.tsx
export default function SiteFooter() {
  return (
    <footer className="border-t bg-white/80 backdrop-blur text-sm text-gray-600">
      <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-center sm:text-left">
          © {new Date().getFullYear()} Herevna.io — All rights reserved.
        </div>
        <nav className="flex gap-4 text-center sm:text-right">
          <a href="/about" className="hover:text-gray-900 transition">About Us</a>
          <a href="/pricing" className="hover:text-gray-900 transition">Pricing</a>
          <a href="/disclaimer" className="hover:text-gray-900 transition">Data Disclaimer</a>
        </nav>
      </div>
    </footer>
  );
}