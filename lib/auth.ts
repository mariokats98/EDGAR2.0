import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [
    Credentials({
      name: "Email Only",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
      },
      async authorize(credentials) {
        const email = (credentials?.email || "").trim().toLowerCase();
        // Basic sanity checks
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

        // OPTIONAL: block disposable domains etc.
        // if (email.endsWith("@mailinator.com")) return null;

        // Find or create user
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({ data: { email } });
        }
        // NextAuth needs a plain object with an id
        return { id: user.id, email: user.email || undefined, name: user.name || undefined };
      },
    }),
  ],
  callbacks: {
    async jwt({ token }) {
      // Lift isPro flag into token on every request
      if (token?.email) {
        const u = await prisma.user.findUnique({
          where: { email: token.email as string },
          select: { isPro: true },
        });
        (token as any).isPro = u?.isPro ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).isPro = (token as any)?.isPro ?? false;
      return session;
    },
  },
};