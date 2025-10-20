// app/account/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, role: true, stripeCustomer: true }
  });

  if (!user) redirect("/signin");

  const isPro = user.role === "PRO";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Account</h1>
      <p className="mb-6 text-gray-600">Signed in as {user.email}</p>

      <div className="rounded border bg-white p-4">
        <div className="mb-2 text-sm">
          <span className="font-medium">Plan:</span> {isPro ? "Pro" : "Free"}
        </div>

        <div className="flex gap-3">
          {!isPro ? (
            <form action="/api/stripe/create-checkout-session" method="POST">
              <button className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
                Upgrade to Pro
              </button>
            </form>
          ) : (
            <form action="/api/stripe/create-portal-session" method="POST">
              <button className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
                Manage Billing
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}