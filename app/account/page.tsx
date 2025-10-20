import { getServerSession } from "next-auth";
import { authOptions, prisma } from "@/lib/auth";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="mt-2 text-gray-700">Please <a className="text-blue-600 underline" href="/signin">sign in</a>.</p>
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
        <div className="mt-4 flex gap-3">
          {user?.isPro ? (
            <a href="/subscribe" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">Manage</a>
          ) : (
            <a href="/subscribe" className="rounded-lg bg-black text-white px-4 py-2 text-sm hover:opacity-90">
              Upgrade to Pro
            </a>
          )}
          <form action="/api/auth/signout" method="post">
            <button className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">Sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}