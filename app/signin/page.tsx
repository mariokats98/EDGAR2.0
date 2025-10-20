"use client";
import * as React from "react";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn("email", { email, callbackUrl: "/account" });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-gray-600">
        We’ll send a secure sign-in link to your email.
      </p>
      {sent ? (
        <div className="mt-6 rounded-lg border bg-white p-4">
          Check your email for the sign-in link.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
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
            {loading ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      )}
    </main>
  );
}