// app/account/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/signin");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { email: true, role: true, stripeCustomerId: true },
  });

  const isPro = user?.role === "PRO";

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold mb-6">Account</h1>

      <div className="space-y-4">
        <p>
          <strong>Email:</strong> {user?.email}
        </p>
        <p>
          <strong>Status:</strong>{" "}
          {isPro ? (
            <span className="text-green-600 font-semibold">PRO Member</span>
          ) : (
            <span className="text-gray-700 font-semibold">Free Tier</span>
          )}
        </p>
      </div>

      <div className="mt-10 space-x-4">
        {!isPro && (
          <form action="/api/stripe/create-checkout-session" method="POST">
            <button
              type="submit"
              className="px-5 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition"
            >
              Upgrade to PRO
            </button>
          </form>
        )}

        {isPro && (
          <form action="/api/stripe/create-portal-session" method="POST">
            <button
              type="submit"
              className="px-5 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition"
            >
              Manage Subscription
            </button>
          </form>
        )}
      </div>

      <p className="mt-10 text-sm text-gray-500">
        Changes to your plan take effect immediately upon confirmation via
        Stripe.
      </p>
    </main>
  );
}