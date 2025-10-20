// app/account/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="mt-2 text-gray-600">
          You’re signed out. <a className="underline" href="/signin">Sign in</a> to manage your plan.
        </p>
      </main>
    );
  }

  // (Optional) reload user to ensure we have latest isPro
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { email: true, isPro: true, stripeCustomerId: true },
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Account</h1>
      <div className="mt-4 rounded-lg border bg-white p-4">
        <div className="text-sm text-gray-700">
          <div><span className="font-medium">Email:</span> {user?.email}</div>
          <div className="mt-1">
            <span className="font-medium">Plan:</span>{" "}
            {user?.isPro ? "Herevna Pro (active)" : "Free"}
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          {!user?.isPro ? (
            <a
              href="/subscribe"
              className="rounded-md bg-black px-4 py-2 text-sm text-white hover:opacity-90"
            >
              Upgrade to Pro
            </a>
          ) : (
            <form
              action="/api/stripe/create-portal-session"
              method="POST"
            >
              <button
                type="submit"
                className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
              >
                Manage Billing
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}