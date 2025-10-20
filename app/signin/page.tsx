"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/account";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await signIn("credentials", { email, callbackUrl });
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold mb-6">Sign in</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <input
          type="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border px-3 py-2"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-black text-white py-2 font-medium hover:bg-gray-900"
        >
          Continue
        </button>
      </form>
      <p className="mt-3 text-sm text-gray-500">
        No password needed. We’ll create your account on first sign in.
      </p>
    </main>
  );
}