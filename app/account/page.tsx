import { getServerSession } from "next-auth";
import { authOptions, prisma } from "@/lib/auth";
import ManageBillingButton from "../components/ManageBillingButton";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="mt-2 text-gray-700">
          Please <a className="text-blue-600 underline" href="/signin">sign in</a>.
        </p>
      </main>
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { email: true, isPro: true, stripeCustomerId: true },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">Account</h1>
      <div className="mt-4 rounded-xl border bg-white p-6">
        <p className="text-sm text-gray-700"><strong>Email:</strong> {user?.email}</p>
        <p className="text-sm text-gray-700 mt-1">
          <strong>Status:</strong> {user?.isPro ? "Pro" : "Free"}
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          {user?.isPro && user?.stripeCustomerId ? (
            <ManageBillingButton />
          ) : (
            <a
              href="/subscribe"
              className="rounded-lg bg-black text-white px-4 py-2 text-sm hover:opacity-90"
            >
              Upgrade to Pro
            </a>
          )}

          <a href="/api/auth/signout" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            Sign out
          </a>
        </div>

        {!user?.stripeCustomerId && user?.isPro && (
          <p className="mt-3 text-xs text-amber-700">
            Your account shows Pro but isn’t linked to Stripe yet. Please contact support@herevna.io to attach your billing.
          </p>
        )}
      </div>
    </main>
  );
}