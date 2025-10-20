// app/signin/page.tsx
import { Suspense } from "react";
import SignInClient from "./sign-in.client";

export const metadata = {
  title: "Sign In — Herevna",
  description: "Access your Herevna account.",
};

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
      <p className="mb-8 text-sm text-gray-600">
        Enter your email to continue. We’ll create your account if it doesn’t exist.
      </p>

      {/* Suspense boundary is required because the client uses useSearchParams */}
      <Suspense fallback={<div className="text-sm text-gray-500">Loading…</div>}>
        <SignInClient />
      </Suspense>
    </div>
  );
}