// app/signin/sign-in.client.tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export default function SignInClient() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // allow ?callbackUrl=/account or fall back to /account
  const callbackUrl = params.get("callbackUrl") || "/account";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Credentials flow: email-only. Your auth.ts creates user if missing.
      const res = await signIn("credentials", {
        email,
        redirect: true,
        callbackUrl,
      });

      // If redirect: true, NextAuth will navigate. If it returns, it failed.
      if (res?.error) setError(res.error);
    } catch (err: any) {
      setError(err?.message || "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </label>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {submitting ? "Signing in..." : "Continue"}
      </button>

      <p className="text-xs text-gray-500">
        By continuing, you agree to the Terms and acknowledge the Data Disclaimer.
      </p>
    </form>
  );
}