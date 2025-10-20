// app/account/page.tsx
import { auth, signIn, signOut } from "@/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();

  // simple UI that compiles even without DB; shows session info
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold mb-4">Account</h1>
        <p className="mb-4">You’re not signed in.</p>
        <Link
          href="/signin"
          className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-4">Account</h1>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm text-gray-600">Signed in as</div>
        <div className="text-lg">{session.user.email ?? session.user.name}</div>
      </div>

      <div className="mt-6 grid gap-3">
        <Link
          href="/pricing"
          className="inline-flex w-fit items-center rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Upgrade to Pro
        </Link>
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <button
            type="submit"
            className="inline-flex w-fit items-center rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}