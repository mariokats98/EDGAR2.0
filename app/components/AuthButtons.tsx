"use client";
import * as React from "react";
import { useSession, signIn, signOut } from "next-auth/react";

export default function AuthButtons() {
  const { data, status } = useSession();
  const isPro = Boolean((data as any)?.isPro);

  if (status === "loading") {
    return <div className="text-sm text-gray-500">…</div>;
  }

  if (!data?.user) {
    return (
      <button
        onClick={() => signIn(undefined, { callbackUrl: "/account" })}
        className="rounded-full bg-black text-white px-3 py-1.5 text-sm hover:opacity-90"
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {isPro && (
        <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs">
          Pro
        </span>
      )}
      <a
        href="/account"
        className="rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
      >
        Account
      </a>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
      >
        Sign out
      </button>
    </div>
  );
}