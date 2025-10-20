"use client";

import { signIn } from "next-auth/react";
import * as React from "react";

export default function SignInPage() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);
    const res = await signIn("email", { email, redirect: false, callbackUrl: "/" });
    if (res?.ok) setSent(true);
    else setErr(res?.error || "Could not send link.");
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 grid place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Sign in to Herevna</h1>
        <p className="mt-1 text-sm text-gray-600">We’ll send you a secure link to your email.</p>

        {sent ? (
          <div className="mt-6 rounded-lg bg-indigo-50 p-4 text-sm text-indigo-900">
            Check your inbox — we’ve sent a sign-in link to <strong>{email}</strong>.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <button
              disabled={loading}
              className="w-full h-10 rounded-lg bg-black text-white text-sm hover:opacity-90"
            >
              {loading ? "Sending…" : "Send sign-in link"}
            </button>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </form>
        )}

        <p className="mt-4 text-[11px] text-gray-500">
          By continuing, you agree to the{" "}
          <a href="/terms" className="underline">Terms</a> and{" "}
          <a href="/privacy" className="underline">Privacy Policy</a>.
        </p>
      </div>
    </main>
  );
}