import { getServerSession } from "next-auth";
import { authOptions, prisma } from "@/lib/auth";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email || "";
  const user = email ? await prisma.user.findUnique({
    where: { email },
    select: { isPro: true, stripeCustomerId: true }
  }) : null;

  const isPro = Boolean(user?.isPro);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Account</h1>
      {!email ? (
        <p className="mt-3 text-gray-600">
          You’re not signed in. <a className="underline" href="/signin">Sign in</a>
        </p>
      ) : (
        <>
          <p className="mt-2 text-gray-700">Signed in as <span className="font-medium">{email}</span></p>
          <div className="mt-6 rounded-xl border bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Plan</div>
                <div className="text-lg font-semibold">{isPro ? "Herevna Pro" : "Free"}</div>
              </div>
              <div className="flex gap-2">
                {!isPro && (
                  <a href="/subscribe" className="rounded-full bg-black text-white px-4 py-2 text-sm hover:opacity-90">
                    Upgrade
                  </a>
                )}
                {user?.stripeCustomerId && (
                  <form action="/api/stripe/create-portal-session" method="POST">
                    <button
                      type="submit"
                      className="rounded-full border px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      Manage Billing
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}