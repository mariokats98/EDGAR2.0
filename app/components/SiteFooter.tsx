// app/components/SiteFooter.tsx
export default function SiteFooter() {
  return (
    <footer className="border-t bg-white/90 backdrop-blur text-sm text-gray-600">
      <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 md:grid-cols-4">
        {/* Brand / Blurb */}
        <div>
          <div className="text-base font-semibold text-gray-900">Herevna.io</div>
          <p className="mt-2 text-gray-600">
            Research-friendly dashboards for filings, economic data, and market insights.
            Information is provided for information & entertainment purposes only.
          </p>
          <p className="mt-3 text-xs text-gray-500">
            © {new Date().getFullYear()} Herevna.io — All rights reserved.
          </p>
        </div>

        {/* Company */}
        <div>
          <div className="text-sm font-semibold text-gray-900">Company</div>
          <ul className="mt-2 space-y-2">
            <li><a href="/about" className="hover:text-gray-900">About Us</a></li>
            <li><a href="/pricing" className="hover:text-gray-900">Pricing</a></li>
            <li><a href="/contact" className="hover:text-gray-900">Contact</a></li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <div className="text-sm font-semibold text-gray-900">Legal</div>
          <ul className="mt-2 space-y-2">
            <li><a href="/disclaimer" className="hover:text-gray-900">Data Disclaimer</a></li>
            <li><a href="/terms" className="hover:text-gray-900">Terms of Service</a></li>
            <li><a href="/privacy" className="hover:text-gray-900">Privacy Policy</a></li>
            <li><a href="/cookies" className="hover:text-gray-900">Cookie Policy</a></li>
          </ul>
        </div>

        {/* Data & Compliance */}
        <div>
          <div className="text-sm font-semibold text-gray-900">Data & Compliance</div>
          <ul className="mt-2 space-y-2">
            <li><a href="/sources" className="hover:text-gray-900">Data Sources</a></li>
            <li className="text-gray-500">
              EDGAR • BLS • FRED and other public sources. Trademarks belong to their owners.
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}