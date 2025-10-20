// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * We use Credentials to "sign up / sign in" with just an email (no password).
 * - If user exists -> sign in
 * - If user doesn't -> create then sign in
 * Pro status is derived from Subscription table, not a User.role field.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },

  providers: [
    CredentialsProvider({
      name: "Email only",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        if (!email) return null;

        // 1) get or create user
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({
            data: { email }, // ⬅️ removed `role`
          });
        }

        // 2) return a minimal user object for the JWT
        return { id: user.id, email: user.email, name: user.email };
      },
    }),
  ],

  callbacks: {
    // Put user id & pro flag into the JWT
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;

        // compute "pro": active subscription whose status is active|trialing
        const sub = await prisma.subscription.findFirst({
          where: {
            userId: user.id,
            status: { in: ["active", "trialing"] },
          },
          select: { id: true },
        });
        token.isPro = !!sub;
      }
      return token;
    },

    // Expose those on the session
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.userId as string | undefined;
        (session.user as any).isPro = token.isPro ?? false;
      }
      return session;
    },
  },

  pages: {
    signIn: "/signin",
  },

  // Make sure your NEXTAUTH_URL and NEXTAUTH_SECRET are set
  debug: false,
};