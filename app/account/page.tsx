// app/account/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma"; // or wherever you export your Prisma client

export default async function AccountPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="mt-4 text-gray-600">
          You’re not signed in. <a className="text-indigo-600 underline" href="/signin">Sign in</a>
        </p>
      </div>
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    // ✅ remove isPro; select fields that exist on your schema
    select: { email: true, role: true, stripeCustomerId: true },
  });

  const isPro = user?.role === "PRO";

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Account</h1>

      <div className="mt-6 rounded-lg border bg-white p-4">
        <div className="text-sm text-gray-600">Email</div>
        <div className="font-medium">{user?.email}</div>

        <div className="mt-4 text-sm text-gray-600">Plan</div>
        <div className="font-medium">{isPro ? "Pro" : "Free"}</div>

        {user?.stripeCustomerId ? (
          <form
            action="/api/stripe/create-portal-session"
            method="POST"
            className="mt-6"
          >
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black/80"
            >
              Manage Billing
            </button>
          </form>
        ) : (
          <form
            action="/api/stripe/create-checkout-session"
            method="POST"
            className="mt-6"
          >
            <input type="hidden" name="priceId" value="price_pro_monthly" />
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Upgrade to Pro
            </button>
          </form>
        )}
      </div>
    </div>
  );
}