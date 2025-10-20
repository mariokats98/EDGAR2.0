// app/account/page.tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="mt-2 text-gray-600">Please sign in to view your account.</p>
      </div>
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { email: true, role: true, createdAt: true },
  });

  const isPro = user?.role === "PRO";

  return (
    <div className="p-6 space-y-2">
      <h1 className="text-xl font-semibold">Account</h1>
      <p className="text-sm text-gray-700">Email: {user?.email}</p>
      <p className="text-sm text-gray-700">Plan: {isPro ? "Pro" : "Free"}</p>
      <p className="text-xs text-gray-500">
        Member since: {user?.createdAt?.toLocaleDateString?.() ?? "—"}
      </p>
    </div>
  );
}