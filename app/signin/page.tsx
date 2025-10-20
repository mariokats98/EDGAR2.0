// app/signin/page.tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { signIn } from "next-auth/react";

function SignInInner() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // optional: read ?callbackUrl= from searchParams if needed
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>

      {/* Example provider button — replace with your providers */}
      <button
        onClick={async () => {
          setLoading(true);
          await signIn(); // default page, or pass 'github' etc
          setLoading(false);
        }}
        className="w-full rounded border px-4 py-2 text-sm hover:bg-gray-50"
      >
        {loading ? "Redirecting..." : "Continue"}
      </button>

      <p className="mt-4 text-xs text-gray-600">
        By continuing, you agree to the Terms and acknowledge the Privacy Policy.
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  );
}