// app/signin/page.tsx
import { Suspense } from "react";
import SignInClient from "./sign-in.client";

export const dynamic = "force-dynamic"; // avoid static export for this page

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <SignInClient />
    </Suspense>
  );
}