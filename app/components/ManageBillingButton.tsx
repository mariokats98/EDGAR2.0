"use client";

import * as React from "react";

export default function ManageBillingButton({ className = "" }: { className?: string }) {
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function onClick() {
    try {
      setErr(null);
      setLoading(true);
      const res = await fetch("/api/stripe/create-portal-session", { method: "POST" });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
      } else {
        setErr(json?.error || "Could not open billing portal.");
      }
    } catch (e: any) {
      setErr(e?.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={onClick}
        disabled={loading}
        className={`rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 ${className}`}
      >
        {loading ? "Opening…" : "Manage Billing"}
      </button>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}