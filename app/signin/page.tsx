"use client";
import * as React from "react";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        callbackUrl: "/account",
      });
      if (res?.error) {
        setError(res.error);
      } else if (res?.ok) {
        window.location.href = "/account";
      } else {
        setError("Could not sign in.");
      }
    } catch (err: any) {
      setError(err?.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-gray-600">
        Enter your email to continue. No code required.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-md border px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-black text-white py-2.5 hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Continue"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-gray-500">
          By continuing you agree to our{" "}
          <a className="underline" href="/terms">Terms</a> and{" "}
          <a className="underline" href="/disclaimer">Data Disclaimer</a>.
        </p>
      </form>
    </main>
  );
}